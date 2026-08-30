# FarmBranch

An innovative agricultural supply chain management platform that connects Farmers, Buyer organizations, Farmer Producer Organizations (FPOs), and Drivers to facilitate efficient crop trading and logistics.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [User Roles & Dashboards](#user-roles--dashboards)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)

## 🌾 Overview

FarmBranch is a web-based platform designed to streamline agricultural commerce by:
- Enabling direct connections between farmers and buyers
- Optimizing transport and logistics routing
- Providing voice-enabled interfaces for accessibility
- Managing orders, billing, and transaction tracking
- Supporting multi-language interfaces for diverse user bases

## ✨ Features

### Core Functionality
- **Multi-Role Authentication**: Secure login for FPOs, Farmers, Buyers, and Drivers
- **Order Management**: Create, track, and manage crop orders with real-time status updates
- **Logistics & Routing**: Calculate optimal delivery routes using geographic coordinates
- **Transport Pricing**: Dynamic pricing based on vehicle type, distance, and load capacity
- **Voice Command Support**: Transcribe and process voice commands using AI-powered speech recognition

### Advanced Features
- **Location-Based Services**: Haversine distance calculation for accurate route planning
- **Multi-Language Support**: Internationalization (i18n) support for diverse user bases
- **Vehicle Management**: Support for multiple vehicle types (Mini Car, Minivan, Commercial Trucks) with configurable pricing
- **Transit Tracking**: Real-time order status tracking (Pending_Pickup, In_Transit, Delivered, etc.)
- **Secure Database**: SQLite with encrypted password storage and referential integrity

## 🛠️ Tech Stack

### Backend
- **Framework**: Flask 3.0.0+
- **Database**: SQLite3
- **CORS**: flask-cors 4.0.0+
- **Speech Recognition**: faster-whisper 1.0.0+
- **Language**: Python 3.x

### Frontend
- **HTML5** with responsive templates
- **CSS3** (responsive design)
- **JavaScript** (ES6+) with modular architecture
- **i18n.js** for multi-language support

### Infrastructure
- RESTful API architecture
- AJAX-based frontend-backend communication
- JSON for data serialization

## 📁 Project Structure

```
FarmBranch/
├── app.py                          # Main Flask application
├── setup_db.py                     # Database initialization and seeding
├── requirements.txt                # Python dependencies
├── farmbranch.db                   # SQLite database (generated)
├── templates/                      # HTML templates
│   ├── index.html                 # Home page
│   ├── routing.html               # Routing & logistics page
│   ├── fpo_dashboard.html         # FPO management dashboard
│   ├── buyer_dashboard.html       # Buyer operations dashboard
│   └── driver_dashboard.html      # Driver interface
└── static/                         # Static assets
    ├── css/
    │   ├── style.css              # Main stylesheet
    │   └── responsive.css         # Responsive design rules
    ├── js/
    │   ├── auth.js                # Authentication logic
    │   ├── buyer.js               # Buyer dashboard functionality
    │   ├── driver.js              # Driver dashboard functionality
    │   ├── fpo.js                 # FPO dashboard functionality
    │   └── i18n.js                # Internationalization
    └── data/
        └── translations.json      # Language translations
```

## 🚀 Installation

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)
- Git (optional)

### Steps

1. **Clone or Download the Repository**
   ```bash
   cd FarmBranch
   ```

2. **Create a Virtual Environment** (Recommended)
   ```bash
   python -m venv venv
   ```

3. **Activate Virtual Environment**
   - On Windows:
     ```bash
     venv\Scripts\activate
     ```
   - On macOS/Linux:
     ```bash
     source venv/bin/activate
     ```

4. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

## 🗄️ Database Setup

The application uses SQLite for data persistence. Follow these steps to initialize the database:

### Automatic Setup
Run the setup script to create and seed the database:
```bash
python setup_db.py
```

### Database Schema
The system creates the following tables:

| Table | Purpose |
|-------|---------|
| `fpos` | Farmer Producer Organizations with location data |
| `farmers` | Individual farmers with crop information |
| `buyers` | Buyer organizations with crop demands |
| `drivers` | Drivers and vehicle information |
| `orders_and_bills` | Orders, transactions, and billing records |

### Features
- **Foreign Key Constraints**: Ensures data integrity
- **Password Security**: SHA-256 hashing for user passwords
- **Timestamps**: Automatic timestamp tracking for records
- **Geographic Data**: Latitude/longitude storage for location-based services

## ▶️ Running the Application

1. **Ensure Virtual Environment is Activated**
   ```bash
   # Windows
   venv\Scripts\activate
   ```

2. **Start the Flask Server**
   ```bash
   python app.py
   ```

3. **Access the Application**
   - Open your web browser and navigate to: `http://localhost:5000`
   - You should see the FarmBranch home page

4. **Stop the Server**
   - Press `Ctrl+C` in the terminal

## 👥 User Roles & Dashboards

### 1. **FPO (Farmer Producer Organization)**
   - **Dashboard**: `/fpo`
   - **Responsibilities**: Manage member farmers, aggregate supplies, negotiate with buyers
   - **Access**: FPO-specific management interface

### 2. **Farmer**
   - **Role**: Supply side of transactions
   - **Functions**: List crops, set pricing, accept/reject orders
   - **Data**: Crop type, quantity, expected price, location

### 3. **Buyer**
   - **Dashboard**: `/buyer`
   - **Responsibilities**: Search available crops, place orders, manage purchases
   - **Access**: Buyer-specific dashboard with crop browsing and ordering
   - **Data**: License verification, crop demand, bidding capacity

### 4. **Driver**
   - **Dashboard**: `/driver`
   - **Responsibilities**: Accept delivery assignments, track shipments, report transit status
   - **Access**: Real-time order assignments and routing information
   - **Vehicle Types Supported**:
     - Mini Car / Pickup (10 quintals capacity)
     - Minivan / Tata Ace (25 quintals capacity)
     - Commercial Truck / 10-Wheeler (150 quintals capacity)

## 🔌 API Endpoints

### Voice Transcription
- **Endpoint**: `POST /api/transcribe-voice`
- **Description**: Convert audio files to text using AI speech recognition
- **Parameters**: 
  - `audio` (file): Audio file in supported formats (.webm, .wav, .mp4, .m4a, .ogg)
- **Response**: JSON with transcribed text

### Page Routes
- `GET /` - Home page
- `GET /routing` - Routing and logistics interface
- `GET /fpo` - FPO dashboard
- `GET /buyer` - Buyer dashboard
- `GET /driver` - Driver dashboard

## ⚙️ Configuration

### Voice Model Configuration
The application uses Whisper (tiny model) for voice transcription:
- **Model**: tiny (lightweight, optimized for CPU)
- **Device**: CPU (can be changed to GPU for better performance)
- **Compute Type**: int8 quantization (for reduced memory usage)

### Vehicle Configuration
Pricing is configured per vehicle type with:
- **Base fare**: Fixed starting price
- **Rate per km**: Variable cost based on distance
- **Capacity**: Maximum load in quintals

### Database Path
Database location: `./farmbranch.db` (relative to app.py)

### CORS Settings
Cross-Origin Resource Sharing is enabled for API flexibility

## 📱 Internationalization (i18n)

The application supports multiple languages through:
- Translation files in `static/data/translations.json`
- i18n.js library for dynamic language switching
- User interface in user's preferred language

## 🔐 Security Features

- **Password Security**: SHA-256 hashing for all passwords
- **CORS Protection**: Configured CORS for API endpoints
- **Database Integrity**: Foreign key constraints and referential integrity
- **OTP Support**: Optional OTP verification for buyers
- **Input Validation**: Server-side validation for all inputs

## 📝 Notes

- The application automatically initializes the database on first run if it doesn't exist
- Schema migrations are handled for database updates
- Voice transcription requires an internet connection for model download (first run only)
- Ensure coordinates (latitude/longitude) are valid for geographic calculations

## 🐛 Troubleshooting

### Database Errors
- Delete `farmbranch.db` and run `python setup_db.py` to reinitialize
- Ensure write permissions in the application directory

### Port Already in Use
- Change the Flask port in app.py: `app.run(port=5001)`

### Voice Transcription Issues
- Ensure audio file format is supported
- Check internet connectivity for model downloads
- Verify CPU resources are available

## 📄 License

[Add your license information here]

## 👨‍💼 Contact & Support

For questions or issues, please contact the development team or check the project documentation.

---

**Happy Farming! 🌾**
