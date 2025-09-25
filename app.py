#!/usr/bin/env python3

from flask import Flask
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Create Flask app
app = Flask(__name__)

# Import and register all routes
from app_routes import register_routes
register_routes(app)

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 GRM - GPU Resource Manager Starting...")
    print("=" * 60)
    print("📊 Debug mode: ENABLED")
    print("🌐 Server: http://0.0.0.0:6969")
    print("🔍 Command logging: ENABLED")
    print("=" * 60)
    
    app.run(debug=True, host='0.0.0.0', port=6969)