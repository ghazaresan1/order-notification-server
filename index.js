console.log('Server starting up...');
require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
app.use(express.json());

// Constants
const SECURITY_KEY = 'Asdiw2737y#376';
const CHECK_INTERVAL = 30000; // 30 seconds
const API_CONFIG = {
    baseUrl: 'https://app.ghazaresan.com/api/',
    endpoints: {
        auth: 'Authorization/Authenticate',
        orders: 'Orders/GetOrders'
    }
};

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID
});

// Store active users
const activeUsers = new Map();

// Authentication function
async function authenticateUser(username, password) {
    try {
        const response = await axios.post(
            `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth}`,
            { username, password },
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'securitykey': SECURITY_KEY,
                    'Origin': 'https://portal.ghazaresan.com',
                    'Referer': 'https://portal.ghazaresan.com/'
                }
            }
        );
        return { success: true, token: response.data.Token };
    } catch (error) {
        return { success: false };
    }
}

// Check orders function
async function checkOrders(username, password, fcmToken) {
console.log(`⏰ Checking orders for ${username} at ${new Date().toISOString()}`);
    const user = activeUsers.get(fcmToken);
    if (!user) return;

    try {
        const auth = await authenticateUser(username, password);
        if (!auth.success) return;

        const ordersResponse = await axios.post(
            `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.orders}`,
            {
                authorizationCode: auth.token,
                securityKey: SECURITY_KEY
            },
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'authorizationcode': auth.token,
                    'securitykey': SECURITY_KEY,
                    'Origin': 'https://portal.ghazaresan.com',
                    'Referer': 'https://portal.ghazaresan.com/'
                }
            }
        );

        const newOrders = ordersResponse.data.filter(order => order.Status === 0);
        
        if (newOrders.length > 0) {
            await admin.messaging().send({
                token: fcmToken,
                notification: {
                    title: 'New Orders Available',
                    body: `You have ${newOrders.length} new order(s) waiting`
                },
                data: {
                    orderCount: newOrders.length.toString()
                }
            });
        }
    } catch (error) {
        console.error('Order check error:', error);
    }
}

// Start checking orders
function startChecking(fcmToken) {
    const user = activeUsers.get(fcmToken);
    if (!user) return;

    if (user.checkInterval) {
        clearInterval(user.checkInterval);
    }

    user.checkInterval = setInterval(() => {
        checkOrders(user.username, user.password, fcmToken);
    }, CHECK_INTERVAL);
    
    activeUsers.set(fcmToken, user);
}

// Register endpoint
app.post('/register', async (req, res) => {
 console.log('🔥 New registration request received:', req.body);
    const { username, password, fcmToken } = req.body;
     console.log(`Processing registration for user: ${username}`);
    try {
        const authResponse = await authenticateUser(username, password);
        if (!authResponse.success) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        activeUsers.set(fcmToken, {
            username,
            password,
            lastOrderId: null,
            checkInterval: null
        });
        
        startChecking(fcmToken);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Unregister endpoint
app.post('/unregister', (req, res) => {
    const { fcmToken } = req.body;
    const user = activeUsers.get(fcmToken);
    
    if (user && user.checkInterval) {
        clearInterval(user.checkInterval);
    }
    
    activeUsers.delete(fcmToken);
    res.json({ success: true });
});

// Add this new endpoint to handle GitHub repository dispatch events
app.post('/dispatch', (req, res) => {
    console.log('📨 Received dispatch event:', req.body);
    const { event_type, client_payload } = req.body;
    
    if (event_type === 'register') {
        const { username, password, fcmToken } = client_payload;
        console.log(`👤 Processing registration for: ${username}`);
        // Your existing registration logic
    }
    
    res.status(200).json({ message: 'Event received' });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('Ready to handle requests!');
});
