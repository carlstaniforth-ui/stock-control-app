const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const QRCode = require('qrcode');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const DATA_FILE = path.join(__dirname, 'data', 'inventory.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // inline scripts used in HTML pages
      styleSrc: ["'self'", "'unsafe-inline'"],   // inline styles used in HTML pages
      imgSrc: ["'self'", "data:"],               // data: needed for QR code images
      connectSrc: ["'self'"]
    }
  }
}));
app.use(cors({
  origin: process.env.BASE_URL || `http://localhost:${PORT}`
}));
app.use(express.json());
app.use(express.static('public'));

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

// Read inventory data
async function readInventory() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { items: [], nextId: 1 };
    }
    throw err;
  }
}

// Write inventory data
async function writeInventory(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Read users data
async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { users: [] };
    }
    throw err;
  }
}

// Write users data
async function writeUsers(data) {
  await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2));
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Admin role middleware
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
}

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 attempts per IP per window
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register user - First user becomes admin, then registration is restricted
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const usersData = await readUsers();

    // Check if any users exist - first user becomes admin, all others become general users
    const isFirstUser = usersData.users.length === 0;

    // Check if user already exists
    if (usersData.users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: usersData.users.length + 1,
      username,
      password: hashedPassword,
      role: isFirstUser ? 'admin' : 'user', // First user is admin
      createdAt: new Date().toISOString(),
      createdBy: isFirstUser ? 'system' : 'unknown'
    };

    usersData.users.push(newUser);
    await writeUsers(usersData);

    res.status(201).json({ 
      message: 'User created successfully', 
      username,
      role: newUser.role,
      isFirstUser 
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const usersData = await readUsers();
    const user = usersData.users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      username: user.username,
      role: user.role || 'user',
      id: user.id
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const usersData = await readUsers();
    const user = usersData.users.find(u => u.id === req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role || 'user',
      createdAt: user.createdAt
    });
  } catch (err) {
    console.error('Error getting user info:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const usersData = await readUsers();
    
    // Return users without passwords
    const sanitizedUsers = usersData.users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role || 'user',
      createdAt: user.createdAt,
      createdBy: user.createdBy
    }));

    res.json(sanitizedUsers);
  } catch (err) {
    console.error('Error listing users:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Create user (admin only)
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (role && role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be "admin" or "user"' });
    }

    const usersData = await readUsers();
    
    // Check if user already exists
    if (usersData.users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: usersData.users.length + 1,
      username,
      password: hashedPassword,
      role: role || 'user',
      createdAt: new Date().toISOString(),
      createdBy: req.user.username
    };

    usersData.users.push(newUser);
    await writeUsers(usersData);

    res.status(201).json({ 
      message: 'User created successfully', 
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        createdAt: newUser.createdAt,
        createdBy: newUser.createdBy
      }
    });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const usersData = await readUsers();
    
    const userIndex = usersData.users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const deletedUser = usersData.users.splice(userIndex, 1)[0];
    await writeUsers(usersData);

    res.json({ 
      message: 'User deleted successfully',
      username: deletedUser.username
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get all items
app.get('/api/items', async (req, res) => {
  try {
    const inventory = await readInventory();
    res.json(inventory.items);
  } catch (err) {
    console.error('Error reading items:', err);
    res.status(500).json({ error: 'Failed to retrieve items' });
  }
});

// Get single item by SKU (public endpoint for QR scanning)
app.get('/api/items/:sku', async (req, res) => {
  try {
    const inventory = await readInventory();
    const item = inventory.items.find(i => i.sku === req.params.sku);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (err) {
    console.error('Error reading item:', err);
    res.status(500).json({ error: 'Failed to retrieve item' });
  }
});

// Create new item (admin only)
app.post('/api/items', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sku, name, stockQuantity, description, location, unitCost, currency } = req.body;

    if (!sku || !name || stockQuantity === undefined) {
      return res.status(400).json({ error: 'SKU, name, and stock quantity required' });
    }

    const inventory = await readInventory();

    // Check if SKU already exists
    if (inventory.items.find(i => i.sku === sku)) {
      return res.status(400).json({ error: 'SKU already exists' });
    }

    const newItem = {
      id: inventory.nextId++,
      sku,
      name,
      stockQuantity: parseInt(stockQuantity),
      description: description || '',
      location: location || '',
      unitCost: unitCost !== undefined ? parseFloat(unitCost) : null,
      currency: currency || 'GBP',
      lastCostUpdate: unitCost !== undefined ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user.username
    };

    inventory.items.push(newItem);
    await writeInventory(inventory);

    res.status(201).json(newItem);
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update item (admin only)
app.put('/api/items/:sku', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const inventory = await readInventory();
    const itemIndex = inventory.items.findIndex(i => i.sku === req.params.sku);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const { name, stockQuantity, description, location, unitCost, currency } = req.body;
    const item = inventory.items[itemIndex];

    if (name) item.name = name;
    if (stockQuantity !== undefined) item.stockQuantity = parseInt(stockQuantity);
    if (description !== undefined) item.description = description;
    if (location !== undefined) item.location = location;
    if (unitCost !== undefined) {
      item.unitCost = parseFloat(unitCost);
      item.lastCostUpdate = new Date().toISOString();
    }
    if (currency !== undefined) item.currency = currency;
    item.updatedAt = new Date().toISOString();
    item.updatedBy = req.user.username;

    await writeInventory(inventory);

    res.json(item);
  } catch (err) {
    console.error('Error updating item:', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Deplete stock (public endpoint - can be called from QR scan)
app.post('/api/items/:sku/deplete', async (req, res) => {
  try {
    const { quantity = 1, pin } = req.body;
    const inventory = await readInventory();
    const item = inventory.items.find(i => i.sku === req.params.sku);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Optional PIN protection (if you want to require a PIN for depletion)
    // Uncomment if you want PIN protection
    // const DEPLETE_PIN = process.env.DEPLETE_PIN || '1234';
    // if (pin !== DEPLETE_PIN) {
    //   return res.status(403).json({ error: 'Invalid PIN' });
    // }

    if (item.stockQuantity < quantity) {
      return res.status(400).json({ 
        error: 'Insufficient stock',
        available: item.stockQuantity,
        requested: quantity
      });
    }

    item.stockQuantity -= quantity;
    item.updatedAt = new Date().toISOString();

    // Log the depletion
    if (!item.depletionLog) {
      item.depletionLog = [];
    }
    item.depletionLog.push({
      quantity,
      timestamp: new Date().toISOString(),
      remainingStock: item.stockQuantity
    });

    await writeInventory(inventory);

    res.json({
      message: 'Stock depleted successfully',
      item: {
        sku: item.sku,
        name: item.name,
        previousStock: item.stockQuantity + quantity,
        currentStock: item.stockQuantity,
        depleted: quantity
      }
    });
  } catch (err) {
    console.error('Error depleting stock:', err);
    res.status(500).json({ error: 'Failed to deplete stock' });
  }
});

// Replenish stock (admin only)
app.post('/api/items/:sku/replenish', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { quantity } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity required' });
    }

    const inventory = await readInventory();
    const item = inventory.items.find(i => i.sku === req.params.sku);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    item.stockQuantity += parseInt(quantity);
    item.updatedAt = new Date().toISOString();
    item.updatedBy = req.user.username;

    await writeInventory(inventory);

    res.json({
      message: 'Stock replenished successfully',
      item
    });
  } catch (err) {
    console.error('Error replenishing stock:', err);
    res.status(500).json({ error: 'Failed to replenish stock' });
  }
});

// Generate QR code for item
app.get('/api/items/:sku/qrcode', async (req, res) => {
  try {
    const inventory = await readInventory();
    const item = inventory.items.find(i => i.sku === req.params.sku);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Generate URL for scanning
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const scanUrl = `${baseUrl}/scan.html?sku=${item.sku}`;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(scanUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({
      sku: item.sku,
      name: item.name,
      scanUrl,
      qrCodeDataUrl
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Get inventory reports (protected)
app.get('/api/reports/inventory', authenticateToken, async (req, res) => {
  try {
    console.log('Reports endpoint called');
    const inventory = await readInventory();
    console.log('Inventory loaded:', inventory);
    const items = inventory.items || [];
    console.log('Items count:', items.length);

    // Calculate totals
    let totalItems = items.length;
    let totalStock = 0;
    let totalValue = 0;
    let itemsWithCost = 0;
    let lowStockItems = 0;
    let zeroStockItems = 0;

    const locationBreakdown = {};
    const topValueItems = [];

    items.forEach(item => {
      totalStock += item.stockQuantity || 0;
      
      if ((item.stockQuantity || 0) <= 5) lowStockItems++;
      if ((item.stockQuantity || 0) === 0) zeroStockItems++;

      // Calculate value
      if (item.unitCost !== null && item.unitCost !== undefined && !isNaN(item.unitCost)) {
        const itemValue = item.stockQuantity * item.unitCost;
        totalValue += itemValue;
        itemsWithCost++;

        // Track by location
        const loc = item.location || 'Unassigned';
        if (!locationBreakdown[loc]) {
          locationBreakdown[loc] = { items: 0, stock: 0, value: 0 };
        }
        locationBreakdown[loc].items++;
        locationBreakdown[loc].stock += item.stockQuantity;
        locationBreakdown[loc].value += itemValue;

        // Track top value items
        topValueItems.push({
          sku: item.sku,
          name: item.name,
          stock: item.stockQuantity,
          unitCost: item.unitCost,
          totalValue: itemValue,
          currency: item.currency || 'GBP'
        });
      }
    });

    // Sort top value items
    topValueItems.sort((a, b) => b.totalValue - a.totalValue);

    res.json({
      summary: {
        totalItems,
        totalStock,
        totalValue: Math.round(totalValue * 100) / 100,
        itemsWithCost,
        itemsWithoutCost: totalItems - itemsWithCost,
        lowStockItems,
        zeroStockItems,
        currency: 'GBP'
      },
      locationBreakdown: Object.entries(locationBreakdown).map(([location, data]) => ({
        location,
        ...data,
        value: Math.round(data.value * 100) / 100
      })),
      topValueItems: topValueItems.slice(0, 20).map(item => ({
        ...item,
        totalValue: Math.round(item.totalValue * 100) / 100
      })),
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Delete item (admin only)
app.delete('/api/items/:sku', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const inventory = await readInventory();
    const itemIndex = inventory.items.findIndex(i => i.sku === req.params.sku);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const deletedItem = inventory.items.splice(itemIndex, 1)[0];
    await writeInventory(inventory);

    res.json({ message: 'Item deleted successfully', item: deletedItem });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Initialize and start server
async function startServer() {
  await ensureDataDir();
  
  app.listen(PORT, () => {
    console.log(`
🚀 Stock Control API Server Running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server: http://localhost:${PORT}
📊 API: http://localhost:${PORT}/api
🏥 Health: http://localhost:${PORT}/api/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Available Endpoints:
  POST   /api/auth/register    - Register new user
  POST   /api/auth/login       - Login and get token
  GET    /api/items            - Get all items
  GET    /api/items/:sku       - Get item by SKU
  POST   /api/items            - Create new item (requires auth)
  PUT    /api/items/:sku       - Update item (requires auth)
  DELETE /api/items/:sku       - Delete item (requires auth)
  POST   /api/items/:sku/deplete    - Deplete stock (public)
  POST   /api/items/:sku/replenish  - Replenish stock (requires auth)
  GET    /api/items/:sku/qrcode     - Get QR code for item

Frontend files:
  📱 Scan Page: http://localhost:${PORT}/scan.html
  🔐 Admin Dashboard: http://localhost:${PORT}/admin.html
  
Press Ctrl+C to stop the server
    `);
  });
}

startServer().catch(console.error);
