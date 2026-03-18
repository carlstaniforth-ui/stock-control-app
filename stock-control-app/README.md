# 📦 QR Code Stock Control System

A complete web-based inventory management system that uses QR codes for quick and easy stock depletion. Perfect for warehouses, stores, or any business that needs to track inventory.

## ✨ Features

- **QR Code Generation**: Automatically generate unique QR codes for each inventory item
- **Mobile-Friendly Scanning**: Scan QR codes with any smartphone to deplete stock instantly
- **Real-Time Updates**: Stock levels update in real-time across all devices
- **User Authentication**: Secure admin dashboard with JWT-based authentication
- **Audit Trail**: Track all stock movements with timestamps and user information
- **Low Stock Alerts**: Visual indicators for items running low on stock
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Access the application**
   - Landing Page: http://localhost:3001
   - Admin Dashboard: http://localhost:3001/admin.html
   - Scan Page: http://localhost:3001/scan.html

## 📱 How It Works

### 1. Admin Setup
1. Open the admin dashboard at `/admin.html`
2. Register a new user account
3. Login with your credentials
4. Add inventory items with SKU, name, and initial stock quantity

### 2. Generate QR Codes
1. For each item, click "View QR" to see its unique QR code
2. Print or display the QR code
3. Attach it to the physical item or storage location

### 3. Scan and Deplete
1. Use any smartphone camera to scan the QR code
2. The scan page opens automatically in the browser
3. View item details and current stock level
4. Click "Deplete Stock" to reduce inventory by 1 (or select quantity)
5. Stock is updated instantly across all devices

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication for admin operations
- **Password Hashing**: bcrypt encryption for stored passwords
- **Protected Endpoints**: Admin operations require valid authentication
- **Public Scanning**: Stock depletion can be done without login (configurable)

### Optional PIN Protection

To require a PIN for stock depletion, uncomment these lines in `server.js`:

```javascript
// In the /api/items/:sku/deplete endpoint:
const DEPLETE_PIN = process.env.DEPLETE_PIN || '1234';
if (pin !== DEPLETE_PIN) {
  return res.status(403).json({ error: 'Invalid PIN' });
}
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token

### Items Management (Protected)
- `GET /api/items` - Get all items
- `POST /api/items` - Create new item (requires auth)
- `PUT /api/items/:sku` - Update item (requires auth)
- `DELETE /api/items/:sku` - Delete item (requires auth)

### Stock Operations
- `GET /api/items/:sku` - Get single item (public)
- `POST /api/items/:sku/deplete` - Deplete stock (public)
- `POST /api/items/:sku/replenish` - Replenish stock (requires auth)
- `GET /api/items/:sku/qrcode` - Get QR code for item (public)

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3001
JWT_SECRET=your-super-secret-key-change-this-in-production
BASE_URL=http://localhost:3001
DEPLETE_PIN=1234
```

**Important**: Change `JWT_SECRET` in production to a strong, random value!

### Data Storage

Currently uses JSON file storage (`data/inventory.json` and `data/users.json`). This is perfect for:
- Small to medium inventories
- Quick setup and testing
- No database required

For production use with larger inventories, consider migrating to:
- PostgreSQL
- MongoDB
- MySQL

## 🚢 Deployment

### Option 1: Railway.app (Recommended)

1. Create account on [Railway.app](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables in Railway dashboard
4. Deploy automatically from Git

### Option 2: Render.com

1. Create account on [Render.com](https://render.com)
2. Create new Web Service
3. Connect repository
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables

### Option 3: Heroku

1. Install Heroku CLI
2. Create Heroku app: `heroku create your-app-name`
3. Set environment variables: `heroku config:set JWT_SECRET=your-secret`
4. Deploy: `git push heroku main`

### Option 4: VPS (DigitalOcean, Linode, AWS EC2)

1. SSH into your server
2. Install Node.js
3. Clone repository
4. Install dependencies: `npm install`
5. Use PM2 to run: `pm2 start server.js --name stock-control`
6. Setup nginx as reverse proxy (optional)

## 🔄 Migrating to a Real Database

To upgrade from JSON files to PostgreSQL:

1. Install PostgreSQL client:
   ```bash
   npm install pg
   ```

2. Create database schema:
   ```sql
   CREATE TABLE items (
     id SERIAL PRIMARY KEY,
     sku VARCHAR(100) UNIQUE NOT NULL,
     name VARCHAR(255) NOT NULL,
     stock_quantity INTEGER DEFAULT 0,
     description TEXT,
     location VARCHAR(255),
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW(),
     created_by VARCHAR(100)
   );

   CREATE TABLE users (
     id SERIAL PRIMARY KEY,
     username VARCHAR(100) UNIQUE NOT NULL,
     password VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );

   CREATE TABLE stock_log (
     id SERIAL PRIMARY KEY,
     item_id INTEGER REFERENCES items(id),
     quantity INTEGER,
     action VARCHAR(50),
     timestamp TIMESTAMP DEFAULT NOW()
   );
   ```

3. Update `server.js` to use PostgreSQL instead of file operations

## 📈 Future Enhancements

- [ ] Barcode support (in addition to QR codes)
- [ ] Email alerts for low stock
- [ ] Export reports (CSV, PDF)
- [ ] Multi-location support
- [ ] Purchase order management
- [ ] Supplier management
- [ ] Mobile apps (iOS/Android)
- [ ] Batch operations (bulk import/export)
- [ ] Advanced analytics and reporting
- [ ] Role-based access control

## 🐛 Troubleshooting

### QR codes not scanning?
- Ensure the QR code is clear and well-lit
- Try a different QR code scanner app
- Check that the BASE_URL environment variable is set correctly

### Stock not updating?
- Check browser console for errors
- Verify server is running
- Check network connectivity

### Can't login?
- Ensure you've registered an account first
- Check that password meets minimum requirements (6 characters)
- Clear browser cache and try again

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 💡 Tips for Production Use

1. **Change the JWT_SECRET**: Use a strong, random value
2. **Enable HTTPS**: Use SSL certificates for secure communication
3. **Regular Backups**: Backup your `data/` directory regularly
4. **Monitor Logs**: Set up logging and monitoring
5. **Consider Database**: Migrate to PostgreSQL/MongoDB for better performance
6. **Add Rate Limiting**: Prevent abuse with rate limiting middleware
7. **Implement PIN Protection**: Enable PIN for stock depletion
8. **Set up CI/CD**: Automate testing and deployment

## 📞 Support

For questions or issues, please open an issue on GitHub or contact the development team.

---

Built with ❤️ using Node.js, Express, and vanilla JavaScript
