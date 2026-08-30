import os
import sqlite3
import math
import hashlib
import tempfile
import random
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from faster_whisper import WhisperModel
import pandas as pd

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'farmbranch.db')
voice_model = WhisperModel("tiny", device="cpu", compute_type="int8")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

VEHICLE_CONFIGS = {
    'Mini Car / Pickup': {'base': 250.0, 'rate': 12.0, 'capacity': 10.0, 'name': 'Mini Car / Pickup'},
    'Car / Mini': {'base': 250.0, 'rate': 12.0, 'capacity': 10.0, 'name': 'Mini Car / Pickup'},
    'Minivan / Tata Ace': {'base': 400.0, 'rate': 18.0, 'capacity': 25.0, 'name': 'Minivan / Tata Ace'},
    'Commercial Truck (10-Wheeler / Eicher)': {'base': 1000.0, 'rate': 35.0, 'capacity': 150.0, 'name': 'Commercial Truck (10-Wheeler / Eicher)'},
    'Truck / 10-Wheeler': {'base': 1000.0, 'rate': 35.0, 'capacity': 150.0, 'name': 'Commercial Truck (10-Wheeler / Eicher)'}
}

# Ensure database is initialized
if not os.path.exists(DB_PATH):
    from setup_db import seed_db
    seed_db()

def init_app_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(orders_and_bills)")
        cols = [r['name'] if isinstance(r, sqlite3.Row) else r[1] for r in cursor.fetchall()]
        if cols and 'transit_status' not in cols:
            cursor.execute("ALTER TABLE orders_and_bills ADD COLUMN transit_status TEXT DEFAULT 'Pending_Pickup'")
            conn.commit()
        conn.close()
    except Exception as e:
        print("Schema migration info:", e)

init_app_db()

# ----------------- PAGE ROUTES ----------------- #

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/routing')
def routing_page():
    return render_template('routing.html')

@app.route('/fpo')
def fpo_page():
    return render_template('fpo_dashboard.html')

@app.route('/buyer')
def buyer_page():
    return render_template('buyer_dashboard.html')

@app.route('/driver')
def driver_page():
    return render_template('driver_dashboard.html')

@app.route('/api/transcribe-voice', methods=['POST'])
def transcribe_voice():
    audio_file = request.files.get('audio')
    if not audio_file or not audio_file.filename:
        return jsonify({'status': 'error', 'message': 'No audio file uploaded'}), 400

    file_extension = os.path.splitext(audio_file.filename)[1].lower() or '.webm'
    if file_extension not in {'.webm', '.wav', '.mp4', '.m4a', '.ogg'}:
        file_extension = '.webm'

    fd, temp_path = tempfile.mkstemp(suffix=file_extension)
    os.close(fd)
    try:
        audio_file.save(temp_path)
        segments, info = voice_model.transcribe(temp_path, beam_size=1)
        transcript = ' '.join(segment.text.strip() for segment in segments if segment.text and segment.text.strip())
        return jsonify({
            'status': 'success',
            'transcript': transcript,
            'detected_language': info.language
        })
    except Exception as exc:
        app.logger.exception('Voice transcription failed')
        return jsonify({'status': 'error', 'message': f'Voice transcription failed: {exc}'}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# ----------------- LIVE PRICING API (Real Data) ----------------- #

@app.route('/api/live-prices', methods=['GET'])
def live_prices():
    try:
        # Read the real Tamil Nadu crop price data
        csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Cleaned_Tamil_Nadu_Crop_Prices_v2.csv')
        
        if not os.path.exists(csv_path):
            return jsonify({
                'status': 'error',
                'message': 'Price data file not found'
            }), 500
        
        # Read CSV using pandas
        df = pd.read_csv(csv_path)
        
        # Ensure required columns exist
        if 'commodity' not in df.columns or 'modal_price' not in df.columns:
            return jsonify({
                'status': 'error',
                'message': 'Invalid CSV format'
            }), 500
        
        # Filter out rows with missing data
        df_clean = df[['commodity', 'modal_price']].dropna()
        
        # Random sample of 8-10 rows for fresh ticker data on each load
        sample_size = min(10, len(df_clean))
        sample_size = max(8, sample_size)
        df_sample = df_clean.sample(n=sample_size, random_state=None)
        
        # Format response as array of objects
        live_data = [
            {
                'commodity': str(row['commodity']).strip(),
                'price': round(float(row['modal_price']), 2)
            }
            for _, row in df_sample.iterrows()
        ]
        
        return jsonify({
            'status': 'success',
            'data': live_data
        }), 200
    
    except FileNotFoundError:
        app.logger.error(f'CSV file not found at path')
        return jsonify({
            'status': 'error',
            'message': 'Price data file not found'
        }), 500
    except Exception as e:
        app.logger.exception('Error fetching live prices')
        return jsonify({
            'status': 'error',
            'message': f'Failed to fetch live prices: {str(e)}'
        }), 500

# ----------------- FPO & FARMER APIS ----------------- #

@app.route('/api/fpo/register', methods=['POST'])
def fpo_register():
    data = request.get_json() or {}
    fpo_id = data.get('fpo_id', '').strip()
    name = data.get('name', '').strip()
    location = data.get('location', '').strip()
    password = data.get('password', '')

    if not fpo_id or not name or not location or not password:
        return jsonify({'status': 'error', 'message': 'All fields are required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM fpos WHERE fpo_id = ?", (fpo_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'status': 'error', 'message': 'FPO ID already registered'}), 400

    lat = data.get('latitude', 11.0168)
    lng = data.get('longitude', 76.9558)
    pwd_hash = hash_password(password)

    cursor.execute("""
        INSERT INTO fpos (fpo_id, name, location, password_hash, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (fpo_id, name, location, pwd_hash, lat, lng))
    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'FPO registered successfully',
        'fpo': {
            'fpo_id': fpo_id,
            'name': name,
            'location': location,
            'latitude': lat,
            'longitude': lng
        }
    })

@app.route('/api/fpo/login', methods=['POST'])
def fpo_login():
    data = request.get_json() or {}
    fpo_id = data.get('fpo_id', '').strip()
    password = data.get('password', '')

    if not fpo_id or not password:
        return jsonify({'status': 'error', 'message': 'FPO ID and password required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fpos WHERE fpo_id = ?", (fpo_id,))
    fpo = cursor.fetchone()
    conn.close()

    if not fpo:
        return jsonify({'status': 'error', 'message': 'FPO ID not found in Government Database'}), 404

    if fpo['password_hash'] != hash_password(password):
        return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401

    return jsonify({
        'status': 'success',
        'fpo': {
            'fpo_id': fpo['fpo_id'],
            'name': fpo['name'],
            'location': fpo['location'],
            'latitude': fpo['latitude'],
            'longitude': fpo['longitude']
        }
    })

@app.route('/api/farmer/add-agristack', methods=['POST'])
def add_agristack_farmer():
    data = request.get_json() or {}
    farmer_id = data.get('farmer_id', '').strip()
    fpo_id = data.get('fpo_id', '').strip()
    name = data.get('name', '').strip()
    location = data.get('location', '').strip()
    phone = data.get('phone', '').strip()
    crop_type = data.get('crop_type', '').strip()
    quantity_quintals = float(data.get('quantity_quintals', 0))
    expected_price = float(data.get('expected_price', 0))
    max_sellable_price = float(data.get('max_sellable_price', 0))
    lat = float(data.get('latitude', 11.0000))
    lng = float(data.get('longitude', 77.0000))

    if not farmer_id or not name or not crop_type or quantity_quintals <= 0:
        return jsonify({'status': 'error', 'message': 'Invalid farmer or crop parameters'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT OR REPLACE INTO farmers (
                farmer_id, fpo_id, name, location, phone, crop_type, 
                quantity_quintals, expected_price, max_sellable_price, 
                latitude, longitude, verified_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Verified by AgriStack')
        """, (farmer_id, fpo_id, name, location, phone, crop_type, quantity_quintals, expected_price, max_sellable_price, lat, lng))
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'status': 'error', 'message': str(e)}), 500

    conn.close()
    return jsonify({
        'status': 'success',
        'message': 'AgriStack farmer successfully onboarded and verified',
        'farmer_id': farmer_id
    })

# ----------------- GEOSPATIAL & MARKET APIS ----------------- #

@app.route('/api/market/all-pins', methods=['GET'])
def get_market_pins():
    fpo_id = request.args.get('fpo_id')
    conn = get_db_connection()
    cursor = conn.cursor()

    if fpo_id:
        cursor.execute("SELECT * FROM farmers WHERE fpo_id = ?", (fpo_id,))
    else:
        cursor.execute("SELECT * FROM farmers")
    farmers = [dict(row) for row in cursor.fetchall()]

    cursor.execute("SELECT * FROM buyers")
    buyers = [dict(row) for row in cursor.fetchall()]

    cursor.execute("SELECT * FROM drivers")
    drivers = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify({
        'status': 'success',
        'farmers': farmers,
        'buyers': buyers,
        'drivers': drivers
    })

# ----------------- BUYER & OTP APIS ----------------- #

@app.route('/api/buyer/send-otp', methods=['POST'])
def buyer_send_otp():
    data = request.get_json() or {}
    license_id = data.get('license_id', '').strip()
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()

    if not license_id:
        return jsonify({'status': 'error', 'message': 'Mandi License ID is required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM buyers WHERE unique_license_id = ?", (license_id,))
    buyer = cursor.fetchone()

    if not buyer:
        cursor.execute("""
            INSERT INTO buyers (unique_license_id, name, phone, location, crop_demanded, buyer_max_bid, latitude, longitude, otp_secret, is_verified)
            VALUES (?, ?, ?, 'Tamil Nadu Mandi Exchange', 'All Crops', 3200.0, 11.0064, 76.9530, '123456', 1)
        """, (license_id, name or "Mandi Trader", phone or "+91 98400 12345"))
        conn.commit()

    conn.close()

    otp_code = '123456'
    return jsonify({
        'status': 'success',
        'message': 'OTP dispatched via Government SMS Gateway',
        'otp': otp_code,
        'license_id': license_id
    })

@app.route('/api/buyer/verify-otp', methods=['POST'])
def buyer_verify_otp():
    data = request.get_json() or {}
    license_id = data.get('license_id', '').strip()
    otp = data.get('otp', '').strip()

    if otp != '123456':
        return jsonify({'status': 'error', 'message': 'Invalid OTP entered'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM buyers WHERE unique_license_id = ?", (license_id,))
    buyer = cursor.fetchone()
    conn.close()

    if not buyer:
        return jsonify({'status': 'error', 'message': 'Buyer license not found'}), 404

    return jsonify({
        'status': 'success',
        'buyer': dict(buyer)
    })

@app.route('/api/buyer/proposal', methods=['POST'])
def create_buyer_proposal():
    data = request.get_json() or {}
    farmer_id = data.get('farmer_id')
    buyer_id = data.get('buyer_id')
    crop_type = data.get('crop_type')
    quantity = float(data.get('quantity_quintals', 0))
    agreed_price = float(data.get('agreed_price_per_qtl', 0))
    vehicle_type = data.get('vehicle_type', 'Minivan / Tata Ace')
    custom_distance = data.get('distance_km')

    if not farmer_id or not buyer_id or quantity <= 0 or agreed_price <= 0:
        return jsonify({'status': 'error', 'message': 'Missing proposal details'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM farmers WHERE farmer_id = ?", (farmer_id,))
    farmer = cursor.fetchone()

    cursor.execute("SELECT * FROM buyers WHERE buyer_id = ?", (buyer_id,))
    buyer = cursor.fetchone()

    if not farmer or not buyer:
        conn.close()
        return jsonify({'status': 'error', 'message': 'Farmer or Buyer not found'}), 404

    if custom_distance and float(custom_distance) > 0:
        distance_km = float(custom_distance)
    else:
        distance_km = haversine_distance(farmer['latitude'], farmer['longitude'], buyer['latitude'], buyer['longitude'])
        if distance_km < 5.0:
            distance_km = 12.5

    # Multi-tier pricing formula: Base + (Distance * Rate) + (Qty * 5)
    v_conf = VEHICLE_CONFIGS.get(vehicle_type, VEHICLE_CONFIGS['Minivan / Tata Ace'])
    base_fare = v_conf['base']
    dist_fare = distance_km * v_conf['rate']
    handling_surcharge = quantity * 5.0
    transport_cost = round(base_fare + dist_fare + handling_surcharge, 2)
    crop_total = round(quantity * agreed_price, 2)
    grand_total = round(crop_total + transport_cost, 2)

    cursor.execute("SELECT driver_id FROM drivers WHERE status = 'Available' LIMIT 1")
    driver_row = cursor.fetchone()
    driver_id = driver_row['driver_id'] if driver_row else 1

    cursor.execute("""
        INSERT INTO orders_and_bills (
            farmer_id, buyer_id, driver_id, crop_type, quantity_quintals, 
            agreed_price_per_qtl, crop_total_cost, transport_distance_km, 
            vehicle_type, transport_cost, grand_total, farmer_approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    """, (farmer_id, buyer_id, driver_id, crop_type, quantity, agreed_price, crop_total, distance_km, v_conf['name'], transport_cost, grand_total))
    
    order_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'Trade proposal generated',
        'order_id': order_id,
        'distance_km': distance_km,
        'transport_cost': transport_cost,
        'crop_total': crop_total,
        'grand_total': grand_total
    })

@app.route('/api/farmer/respond-proposal', methods=['POST'])
def respond_farmer_proposal():
    data = request.get_json() or {}
    order_id = data.get('order_id')
    status = data.get('status')

    if not order_id or status not in ['Approved', 'Rejected']:
        return jsonify({'status': 'error', 'message': 'Invalid response parameter'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE orders_and_bills 
        SET farmer_approval_status = ? 
        WHERE order_id = ?
    """, (status, order_id))
    conn.commit()

    cursor.execute("SELECT * FROM orders_and_bills WHERE order_id = ?", (order_id,))
    order = cursor.fetchone()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f'Trade proposal {status}',
        'order': dict(order) if order else None
    })

# ----------------- LOGISTICS & MULTI-TIER BILLING APIS ----------------- #

@app.route('/api/logistics/calculate-and-bill', methods=['POST'])
def calculate_and_bill():
    data = request.get_json() or {}
    farmer_id = data.get('farmer_id')
    buyer_id = data.get('buyer_id')
    vehicle_type = data.get('vehicle_type', 'Minivan / Tata Ace')
    custom_distance = data.get('distance_km')
    custom_qty = data.get('quantity_quintals')

    v_conf = VEHICLE_CONFIGS.get(vehicle_type, VEHICLE_CONFIGS['Minivan / Tata Ace'])

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM farmers WHERE farmer_id = ?", (farmer_id,))
    farmer = cursor.fetchone()

    cursor.execute("SELECT * FROM buyers WHERE buyer_id = ?", (buyer_id,))
    buyer = cursor.fetchone()

    if not farmer or not buyer:
        conn.close()
        return jsonify({'status': 'error', 'message': 'Farmer or Buyer record not found'}), 404

    qty = float(custom_qty) if custom_qty else float(farmer['quantity_quintals'])

    if custom_distance and float(custom_distance) > 0:
        distance_km = float(custom_distance)
    else:
        distance_km = haversine_distance(farmer['latitude'], farmer['longitude'], buyer['latitude'], buyer['longitude'])
        if distance_km < 5.0:
            distance_km = 18.5

    # Multi-Tier Vehicle Cost Calculation: Base + (Distance * Rate) + (Qty * 5)
    base_fare = v_conf['base']
    dist_fare = distance_km * v_conf['rate']
    handling_surcharge = qty * 5.0
    transport_cost = round(base_fare + dist_fare + handling_surcharge, 2)

    # Pick an available driver
    cursor.execute("SELECT * FROM drivers WHERE status = 'Available' LIMIT 1")
    driver = cursor.fetchone()
    if not driver:
        cursor.execute("SELECT * FROM drivers LIMIT 1")
        driver = cursor.fetchone()

    driver_id = driver['driver_id'] if driver else None
    driver_name = driver['driver_name'] if driver else "Commercial Dispatch"
    driver_rc = driver['vehicle_number'] if driver else "TN-38-AB-1234"

    agreed_rate = min(buyer['buyer_max_bid'], farmer['max_sellable_price'])
    crop_total = round(qty * agreed_rate, 2)
    grand_total = round(crop_total + transport_cost, 2)

    cursor.execute("""
        INSERT INTO orders_and_bills (
            farmer_id, buyer_id, driver_id, crop_type, quantity_quintals,
            agreed_price_per_qtl, crop_total_cost, transport_distance_km,
            vehicle_type, transport_cost, grand_total, farmer_approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved')
    """, (farmer_id, buyer_id, driver_id, farmer['crop_type'], qty, agreed_rate, crop_total, distance_km, v_conf['name'], transport_cost, grand_total))
    
    order_id = cursor.lastrowid
    conn.commit()

    cursor.execute("SELECT created_at FROM orders_and_bills WHERE order_id = ?", (order_id,))
    created_at = cursor.fetchone()['created_at']
    conn.close()

    invoice_payload = {
        'order_id': order_id,
        'created_at': created_at,
        'crop_type': farmer['crop_type'],
        'quantity_quintals': qty,
        'agreed_price_per_qtl': agreed_rate,
        'crop_total_cost': crop_total,
        'transport_distance_km': distance_km,
        'vehicle_type': v_conf['name'],
        'base_fare': base_fare,
        'rate_per_km': v_conf['rate'],
        'handling_surcharge': handling_surcharge,
        'transport_cost': transport_cost,
        'grand_total': grand_total,
        'driver_name': driver_name,
        'driver_rc': driver_rc
    }

    return jsonify({
        'status': 'success',
        'invoice': invoice_payload,
        'farmer': dict(farmer),
        'buyer': dict(buyer)
    })

# ----------------- DRIVER & DISPATCH APIS ----------------- #

@app.route('/api/driver/register', methods=['POST'])
def driver_register():
    data = request.get_json() or {}
    driver_name = data.get('driver_name', '').strip()
    phone = data.get('phone', '').strip()
    license_number = data.get('license_number', '').strip()
    vehicle_number = data.get('vehicle_number', '').strip()
    vehicle_type = data.get('vehicle_type', 'Minivan / Tata Ace')
    capacity_quintals = float(data.get('capacity_quintals', 20))
    rate_per_km = float(data.get('rate_per_km', 18))
    lat = float(data.get('latitude', 11.0100))
    lng = float(data.get('longitude', 76.9600))

    if not driver_name or not license_number or not vehicle_number:
        return jsonify({'status': 'error', 'message': 'All commercial driver fields are required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT OR REPLACE INTO drivers (
                driver_name, phone, license_number, vehicle_number, vehicle_type,
                capacity_quintals, rate_per_km, status, latitude, longitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?)
        """, (driver_name, phone, license_number, vehicle_number, vehicle_type, capacity_quintals, rate_per_km, lat, lng))
        driver_id = cursor.lastrowid
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'status': 'error', 'message': str(e)}), 500

    cursor.execute("SELECT * FROM drivers WHERE driver_id = ?", (driver_id,))
    driver = cursor.fetchone()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'Driver registered and verified',
        'driver': dict(driver)
    })

@app.route('/api/driver/notifications/<int:driver_id>', methods=['GET'])
def get_driver_notifications(driver_id):
    conn = get_db_connection()
    # Fetch orders approved by the farmer that are still unassigned / pending driver pickup
    query = '''
        SELECT o.*, f.name AS farmer_name, f.location AS farmer_location, f.phone AS farmer_phone,
               b.name AS buyer_name, b.location AS buyer_location, b.phone AS buyer_phone
        FROM orders_and_bills o
        JOIN farmers f ON o.farmer_id = f.farmer_id
        JOIN buyers b ON o.buyer_id = b.buyer_id
        WHERE (o.driver_id = ? OR o.driver_id IS NULL OR o.driver_id = 0)
          AND (o.transit_status IS NULL OR o.transit_status = 'Pending_Pickup')
        ORDER BY o.order_id DESC
        LIMIT 1
    '''
    order = conn.execute(query, (driver_id,)).fetchone()

    # Query active transit assigned to this driver
    active_query = '''
        SELECT o.*, f.name AS farmer_name, f.location AS farmer_location, f.phone AS farmer_phone,
               b.name AS buyer_name, b.location AS buyer_location, b.phone AS buyer_phone
        FROM orders_and_bills o
        JOIN farmers f ON o.farmer_id = f.farmer_id
        JOIN buyers b ON o.buyer_id = b.buyer_id
        WHERE o.driver_id = ? AND o.transit_status = 'In_Transit'
        ORDER BY o.order_id DESC
        LIMIT 1
    '''
    active_order = conn.execute(active_query, (driver_id,)).fetchone()
    conn.close()

    if order:
        order_dict = dict(order)
        return jsonify({
            "status": "success",
            "has_dispatch": True,
            "order": order_dict,
            "pending_order": order_dict,
            "active_transit": dict(active_order) if active_order else None
        }), 200

    return jsonify({
        "status": "success",
        "has_dispatch": False,
        "active_transit": dict(active_order) if active_order else None
    }), 200


@app.route('/api/driver/accept-order', methods=['POST'])
def accept_driver_order():
    data = request.get_json() or {}
    order_id = data.get('order_id')
    driver_id = data.get('driver_id')

    if not order_id or not driver_id:
        return jsonify({"status": "error", "message": "Missing order_id or driver_id"}), 400

    conn = get_db_connection()
    # Update driver status
    conn.execute("UPDATE drivers SET status = 'Busy' WHERE driver_id = ?", (driver_id,))
    # Update status to 'In_Transit' and lock the driver
    conn.execute('''
        UPDATE orders_and_bills
        SET driver_id = ?, transit_status = 'In_Transit'
        WHERE order_id = ?
    ''', (driver_id, order_id))
    conn.commit()

    order_row = conn.execute('''
        SELECT o.*, f.name AS farmer_name, f.location AS farmer_location, f.phone AS farmer_phone,
               b.name AS buyer_name, b.location AS buyer_location, b.phone AS buyer_phone
        FROM orders_and_bills o
        JOIN farmers f ON o.farmer_id = f.farmer_id
        JOIN buyers b ON o.buyer_id = b.buyer_id
        WHERE o.order_id = ?
    ''', (order_id,)).fetchone()
    conn.close()

    return jsonify({
        "status": "success",
        "message": f"Order #{order_id} locked and in-transit",
        "order": dict(order_row) if order_row else None
    }), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
