import sqlite3
import os
import hashlib
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'farmbranch.db')

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")

    # 1. FPOs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS fpos (
        fpo_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Farmers Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS farmers (
        farmer_id TEXT PRIMARY KEY,
        fpo_id TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        phone TEXT NOT NULL,
        crop_type TEXT NOT NULL,
        quantity_quintals REAL NOT NULL,
        expected_price REAL NOT NULL,
        max_sellable_price REAL NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        verified_status TEXT DEFAULT 'Verified by AgriStack',
        FOREIGN KEY (fpo_id) REFERENCES fpos(fpo_id) ON DELETE CASCADE
    );
    """)

    # 3. Buyers Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS buyers (
        buyer_id INTEGER PRIMARY KEY AUTOINCREMENT,
        unique_license_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        location TEXT NOT NULL,
        crop_demanded TEXT NOT NULL,
        buyer_max_bid REAL NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        otp_secret TEXT DEFAULT '123456',
        is_verified BOOLEAN DEFAULT 1
    );
    """)

    # 4. Drivers Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS drivers (
        driver_id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        license_number TEXT UNIQUE NOT NULL,
        vehicle_number TEXT UNIQUE NOT NULL,
        vehicle_type TEXT NOT NULL,
        capacity_quintals REAL NOT NULL,
        rate_per_km REAL NOT NULL,
        status TEXT DEFAULT 'Available',
        latitude REAL NOT NULL,
        longitude REAL NOT NULL
    );
    """)

    # 5. Orders and Bills Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders_and_bills (
        order_id INTEGER PRIMARY KEY AUTOINCREMENT,
        farmer_id TEXT NOT NULL,
        buyer_id INTEGER NOT NULL,
        driver_id INTEGER,
        crop_type TEXT NOT NULL,
        quantity_quintals REAL NOT NULL,
        agreed_price_per_qtl REAL NOT NULL,
        crop_total_cost REAL NOT NULL,
        transport_distance_km REAL NOT NULL,
        vehicle_type TEXT NOT NULL,
        transport_cost REAL NOT NULL,
        grand_total REAL NOT NULL,
        farmer_approval_status TEXT DEFAULT 'Pending',
        transit_status TEXT DEFAULT 'Pending_Pickup',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
        FOREIGN KEY (buyer_id) REFERENCES buyers(buyer_id),
        FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    );
    """)

    conn.commit()
    return conn

def seed_db():
    conn = init_db()
    cursor = conn.cursor()

    # Check if already seeded
    cursor.execute("SELECT COUNT(*) FROM fpos;")
    if cursor.fetchone()[0] > 0:
        print("Database already contains data. Skipping seeding.")
        conn.close()
        return

    print("Seeding database with Tamil Nadu AgriTech clusters...")

    # Seed FPOs
    sample_fpos = [
        ("FPO-TN-CBE-01", "Kongu Farmers Producer Co.", "Coimbatore Rural, Tamil Nadu", hash_password("fpo123"), 11.0168, 76.9558),
        ("FPO-TN-MDU-02", "Madurai Pandian Agri Federation", "Madurai South, Tamil Nadu", hash_password("fpo123"), 9.9252, 78.1198),
        ("FPO-TN-SLM-03", "Salem Mango & Agro Producers Org", "Salem Agri Zone, Tamil Nadu", hash_password("fpo123"), 11.6643, 78.1460),
        ("FPO-TN-TRY-04", "Cauvery Delta Organic Collective", "Trichy Hub, Tamil Nadu", hash_password("fpo123"), 10.7905, 78.7047),
        ("FPO-TN-TNJ-05", "Thanjavur Rice Bowl Producer Org", "Thanjavur Central, Tamil Nadu", hash_password("fpo123"), 10.7870, 79.1378)
    ]
    cursor.executemany("""
        INSERT INTO fpos (fpo_id, name, location, password_hash, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?)
    """, sample_fpos)

    # Seed Farmers
    sample_farmers = [
        ("AGRI-TN-88219", "FPO-TN-CBE-01", "M. Selvakumar", "Pollachi, Coimbatore", "+91 98421 11029", "Coconut / Copra", 120.0, 2800.0, 3200.0, 10.6580, 77.0086, "Verified by AgriStack"),
        ("AGRI-TN-88220", "FPO-TN-CBE-01", "K. Arumugam", "Kinathukadavu, Coimbatore", "+91 98421 22031", "Tomato", 80.0, 1800.0, 2200.0, 10.8220, 77.0180, "Verified by AgriStack"),
        ("AGRI-TN-88221", "FPO-TN-MDU-02", "P. Muthuramalingam", "Melur, Madurai", "+91 97500 33042", "Jasmine & Flowers", 45.0, 4500.0, 5200.0, 10.0310, 78.3360, "Verified by AgriStack"),
        ("AGRI-TN-88222", "FPO-TN-MDU-02", "R. Palanichamy", "Usilampatti, Madurai", "+91 97500 44053", "Cotton", 150.0, 6800.0, 7400.0, 9.9670, 77.7940, "Verified by AgriStack"),
        ("AGRI-TN-88223", "FPO-TN-SLM-03", "S. Senthil Kumar", "Mettur, Salem", "+91 94432 55064", "Tapioca (Cassava)", 220.0, 1400.0, 1750.0, 11.7940, 77.8000, "Verified by AgriStack"),
        ("AGRI-TN-88224", "FPO-TN-SLM-03", "G. Loganathan", "Attur, Salem", "+91 94432 66075", "Turmeric", 95.0, 7200.0, 8100.0, 11.5970, 78.5980, "Verified by AgriStack"),
        ("AGRI-TN-88225", "FPO-TN-TRY-04", "V. Ramakrishnan", "Lalgudi, Trichy", "+91 98940 77086", "Banana (Grand Naine)", 300.0, 2100.0, 2600.0, 10.8680, 78.8140, "Verified by AgriStack"),
        ("AGRI-TN-88226", "FPO-TN-TRY-04", "T. Jayabalan", "Manachanallur, Trichy", "+91 98940 88097", "Ponni Paddy", 400.0, 2400.0, 2750.0, 10.9060, 78.7040, "Verified by AgriStack"),
        ("AGRI-TN-88227", "FPO-TN-TNJ-05", "D. Anbazhagan", "Papanasam, Thanjavur", "+91 94860 99108", "Kuruvai Paddy", 500.0, 2350.0, 2650.0, 10.9230, 79.2780, "Verified by AgriStack"),
        ("AGRI-TN-88228", "FPO-TN-TNJ-05", "N. Soundararajan", "Orathanadu, Thanjavur", "+91 94860 10219", "Black Gram (Urad)", 70.0, 6200.0, 6900.0, 10.6270, 79.2550, "Verified by AgriStack")
    ]
    cursor.executemany("""
        INSERT INTO farmers (farmer_id, fpo_id, name, location, phone, crop_type, quantity_quintals, expected_price, max_sellable_price, latitude, longitude, verified_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sample_farmers)

    # Seed Buyers
    sample_buyers = [
        ("MANDI-TN-2026-9041", "Coimbatore APMC Central Mandi", "+91 98400 12345", "R.S. Puram, Coimbatore", "Coconut / Copra", 3100.0, 11.0064, 76.9530, "123456", 1),
        ("MANDI-TN-2026-9042", "Madurai Wholesale Grain & Spice Market", "+91 98400 23456", "Mattuthavani, Madurai", "Cotton", 7250.0, 9.9480, 78.1560, "123456", 1),
        ("MANDI-TN-2026-9043", "Salem Turmeric & Starch Agro Traders", "+91 98400 34567", "Leigh Bazaar, Salem", "Turmeric", 7900.0, 11.6570, 78.1510, "123456", 1),
        ("MANDI-TN-2026-9044", "Trichy Central Banana & Paddy Exchange", "+91 98400 45678", "Gandhi Market, Trichy", "Ponni Paddy", 2650.0, 10.8240, 78.6960, "123456", 1),
        ("MANDI-TN-2026-9045", "Cauvery Delta Food Processing Corp", "+91 98400 56789", "Vallam Road, Thanjavur", "Kuruvai Paddy", 2550.0, 10.7480, 79.0880, "123456", 1),
        ("MANDI-TN-2026-9046", "Chennai Agro Export Terminal (Hub)", "+91 98400 67890", "Koyambedu Wholesale Market, Chennai", "Banana (Grand Naine)", 2500.0, 13.0694, 80.1948, "123456", 1)
    ]
    cursor.executemany("""
        INSERT INTO buyers (unique_license_id, name, phone, location, crop_demanded, buyer_max_bid, latitude, longitude, otp_secret, is_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sample_buyers)

    # Seed Drivers
    sample_drivers = [
        ("M. Velu", "+91 99401 10011", "DL-TN-38-2018-0091", "TN-38-AB-1234", "Minivan / Tata Ace", 15.0, 18.0, "Available", 11.0100, 76.9600),
        ("K. Duraisamy", "+91 99401 20022", "DL-TN-37-2019-4452", "TN-37-BY-5678", "Car / Mini", 8.0, 12.0, "Available", 10.9800, 76.9200),
        ("S. Chinnasamy", "+91 99401 30033", "DL-TN-58-2016-8819", "TN-58-CZ-9012", "Truck / 10-Wheeler", 120.0, 35.0, "Available", 9.9300, 78.1200),
        ("P. Ramu", "+91 99401 40044", "DL-TN-27-2020-7711", "TN-27-DX-3456", "Minivan / Tata Ace", 20.0, 18.0, "Available", 11.6700, 78.1400),
        ("T. Kumar", "+91 99401 50055", "DL-TN-45-2017-6623", "TN-45-EW-7890", "Truck / 10-Wheeler", 150.0, 35.0, "Available", 10.8000, 78.7000),
        ("V. Nagaraj", "+91 99401 60066", "DL-TN-49-2021-3318", "TN-49-FA-2345", "Minivan / Tata Ace", 25.0, 18.0, "Available", 10.7800, 79.1400)
    ]
    cursor.executemany("""
        INSERT INTO drivers (driver_name, phone, license_number, vehicle_number, vehicle_type, capacity_quintals, rate_per_km, status, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sample_drivers)

    # Seed Initial Completed/Pending Orders
    sample_orders = [
        ("AGRI-TN-88219", 1, 1, "Coconut / Copra", 50.0, 3000.0, 150000.0, 42.5, "Minivan / Tata Ace", 765.0, 150765.0, "Approved"),
        ("AGRI-TN-88224", 3, 4, "Turmeric", 40.0, 7600.0, 304000.0, 35.0, "Minivan / Tata Ace", 630.0, 304630.0, "Approved"),
        ("AGRI-TN-88226", 4, 5, "Ponni Paddy", 100.0, 2600.0, 260000.0, 18.2, "Truck / 10-Wheeler", 637.0, 260637.0, "Pending")
    ]
    cursor.executemany("""
        INSERT INTO orders_and_bills (farmer_id, buyer_id, driver_id, crop_type, quantity_quintals, agreed_price_per_qtl, crop_total_cost, transport_distance_km, vehicle_type, transport_cost, grand_total, farmer_approval_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sample_orders)

    conn.commit()
    conn.close()
    print("Database initialization and Tamil Nadu cluster seeding complete!")

if __name__ == '__main__':
    seed_db()
