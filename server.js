const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const dbConfig = {
  user: 'web_project_db_jb6p_user',
  host: 'dpg-d0eern49c44c738158v0-a.oregon-postgres.render.com',
  database: 'web_project_db_jb6p',
  password: 'YXtt8WpMN0dH2nMBakass1fiLX44xu10',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
};

const pool = new Pool(dbConfig);


const bcrypt = require('bcrypt');
const saltRounds = 10;

app.post('/register', async (req, res) => {

    const { username, category, portfio, description, email, password } = req.body;
    console.log("Register attempt:", { username, email });

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    let client;

    try {
    
        client = await pool.connect();
        const checkSql = 'SELECT * FROM developrs WHERE username = $1 OR email = $2 LIMIT 1;';
        const checkResult = await client.query(checkSql, [username, email]);

        if (checkResult.rows.length > 0) {
            const existingUser = checkResult.rows[0];
            let conflictField = '';
            if (existingUser.username === username) {
                conflictField = 'Username';
            } else if (existingUser.email === email) {
                conflictField = 'Email';
            }
             console.log(`${conflictField} already exists: ${username}/${email}`);
            return res.status(409).json({ error: `${conflictField} already exists.` });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log(`Password hashed for user: ${username}`);

        const insertSql = `
            INSERT INTO developrs (username, category, portfio, description, email, password_hash)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, username, email;
        `;

        const insertValues = [username, category, portfio, description, email, hashedPassword];
        const insertResult = await client.query(insertSql, insertValues);

        console.log("User registered successfully:", insertResult.rows[0]);

        res.status(201).json({
            message: 'Developer registered successfully!',
            developer: insertResult.rows[0]
        });

    } catch (error) {
        console.error('Error during registration:', error.stack);
        res.status(500).json({ error: 'Internal server error during registration.' });
    } finally {
         if (client) {
            client.release();
            console.log("Registration client released.");
         }
    }
});

app.post('/login', async (req, res) => {
    const { identifier, password } = req.body;
    console.log("Login attempt:", { identifier });

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Username/email and password are required.' });
    }

     let client;

    try {
         client = await pool.connect();
    
        const findSql = 'SELECT * FROM developrs WHERE username = $1 OR email = $1 LIMIT 1;';
        const findResult = await client.query(findSql, [identifier]);

        if (findResult.rows.length === 0) {
             console.log(`Login failed: User not found - ${identifier}`);
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const user = findResult.rows[0];

        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            console.log(`Login successful for user: ${user.username}`);
            
            res.status(200).json({
                message: 'Login successful!',
                developer: {
                    id: user.id,
                    username: user.username,
                    category: user.category,
                    portfio: user.portfio,
                    description: user.description,
                    email: user.email
                }
            });
        } else {
             console.log(`Login failed: Incorrect password for user: ${user.username}`);
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

    } catch (error) {
        console.error('Error during login:', error.stack);
        res.status(500).json({ error: 'Internal server error during login.' });
    } finally {
        if (client) {
             client.release();
             console.log("Login client released.");
        }
    }
});


app.get('/orders', async (req, res) => {
    const { userId } = req.query;
    console.log("Fetching orders for userId:", userId);

    if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required.' });
    }

    let client;

    try {
        client = await pool.connect();
        const findSql = 'SELECT * FROM orders WHERE developer_id = $1 ORDER BY start_date DESC;'; 
        const findResult = await client.query(findSql, [userId]);

        const orders = findResult.rows;

        console.log(`Found ${orders.length} orders for user: ${userId}`);

        res.status(200).json(orders);

    } catch (error) {
        console.error('Error fetching user orders:', error.stack);
        res.status(500).json({ error: 'Internal server error while fetching orders.' });
    } finally {
        if (client) {
            client.release();
            console.log("Orders fetch client released.");
        }
    }
});


app.patch('/orders/:orderId/status', async (req, res) => {
    
    const { orderId } = req.params; 
    const { status: newStatus } = req.body;

    console.log(`Received status update request for order: ${orderId} to status: ${newStatus}`);

    const orderIdNum = parseInt(orderId, 10);
    if (isNaN(orderIdNum)) {
        return res.status(400).json({ error: 'Invalid order ID format. Must be a number.' });
    }

    if (!newStatus) {
        return res.status(400).json({ error: 'New status is required in the request body.' });
    }

    const allowedStatuses = ['Waiting', 'In Progress', 'Completed'];
    if (!allowedStatuses.includes(newStatus)) {
        return res.status(400).json({
            error: `Invalid status value provided. Allowed values are: ${allowedStatuses.join(', ')}`
        });
    }

    let client;
    try {
        client = await pool.connect();

        const updateSql = `
            UPDATE orders
            SET status = $1
            WHERE order_number = $2
            RETURNING order_number, status; -- Return updated info to confirm
        `;
        const values = [newStatus, orderIdNum];

        const result = await client.query(updateSql, values);

        if (result.rowCount === 0) {
            console.log(`Status update failed: Order ${orderIdNum} not found.`);
            return res.status(404).json({ error: `Order with ID ${orderIdNum} not found.` });
        }

        console.log(`Successfully updated status for order ${orderIdNum} to ${newStatus}`);
        res.status(200).json({
            message: 'Order status updated successfully!',
            updatedOrder: result.rows[0]
        });

    } catch (error) {
        console.error(`Database error updating status for order ${orderIdNum}:`, error.stack);
        res.status(500).json({ error: 'Internal server error while updating order status.' });
    } finally {
        if (client) {
            client.release();
            console.log(`Status update client released for order ${orderIdNum}.`);
        }
    }
});


app.get('/api/developers', async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      const result = await client.query('SELECT username, portfio, description, category FROM developrs');
      res.json(result.rows);
    } catch (err) {
      console.error('Database error:', err);
      res.status(500).send('Server error');
    }
  });
  

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client for connection test:', err.stack);
    }
    client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
            return console.error('Error executing test query:', err.stack);
        }
        console.log('Successfully connected to database. Server time:', result.rows[0].now);
    });
});

app.get('/developers', async (req, res) => {
    console.log("Received request for /developers");
    try {
        const sql = 'SELECT id, username, portfio, description, category FROM developrs ORDER BY created_at DESC;'; // Now includes id

        const result = await pool.query(sql);

        console.log("Successfully fetched developers data.");

        res.status(200).json(result.rows);

    } catch (error) {
        console.error('Error fetching developers:', error.stack);
        res.status(500).json({ error: 'Failed to fetch developers from the database.' });
    }
});

app.get('/', (req, res) => {
    res.send('Hello! This is the Developer API backend.');
});

app.post('/contact', async (req, res) => {
    const { developer_id, name, description, budget, phone } = req.body;
    if (!developer_id || !name || !description || !budget || !phone) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    let client;
    try {
        client = await pool.connect();
        const insertSql = `
            INSERT INTO orders (developer_id, start_date, name, description, budget, phone)
            VALUES ($1, NOW(), $2, $3, $4, $5)
            RETURNING *;
        `;
        const values = [developer_id, name, description, budget, phone];
        const result = await client.query(insertSql, values);
        res.status(201).json({ message: 'Order created successfully!', order: result.rows[0] });
    } catch (error) {
        console.error('Error creating order:', error.stack);
        res.status(500).json({ error: 'Internal server error while creating order.' });
    } finally {
        if (client) client.release();
    }
});

app.listen(port, () => {
    console.log(`Server is running and listening on port ${port}`);
    console.log(`Access the developers endpoint at: http://localhost:${port}/developers`);
});


process.on('SIGINT', async () => {
    console.log("\nCaught interrupt signal (Ctrl+C). Shutting down gracefully.");
    try {
        await pool.end();
        console.log("Database pool closed.");
        process.exit(0);
    } catch (err) {
        console.error("Error during shutdown:", err.stack);
        process.exit(1);
    }
});
