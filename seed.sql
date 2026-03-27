-- Seed data for ReviewGate

-- Admin user (password: admin123)
INSERT OR IGNORE INTO admin_users (name, email, password_hash, role) VALUES
('Admin User', 'admin@reviewgate.com', 'a9993e364706816aba3e25717850c26c9cd0d89d', 'superadmin');

-- Reward tiers
INSERT OR IGNORE INTO reward_tiers (name, description, points_required, reward_type, reward_value) VALUES
('Coffee Break', 'Get a $5 PayPal payment', 500, 'paypal', 5.00),
('Lunch Money', 'Get a $10 PayPal payment', 1000, 'paypal', 10.00),
('Shopping Fund', 'Get a $25 PayPal payment', 2500, 'paypal', 25.00),
('Big Reward', 'Get a $50 PayPal payment', 5000, 'paypal', 50.00),
('Premium Cash', 'Get a $100 PayPal payment', 10000, 'paypal', 100.00);

-- Demo business (password: demo123)
INSERT OR IGNORE INTO businesses (name, email, password_hash, industry, website, plan, google_url, trustpilot_url) VALUES
('Acme Coffee Co', 'business@demo.com', 'a6d6f8c6c0db8aad2f9a7d5e3b2c1f0e9d8c7b6a', 'Food & Beverage', 'https://acmecoffee.com', 'growth', 'https://g.page/acmecoffee', 'https://www.trustpilot.com/review/acmecoffee.com');

-- Demo customer (password: demo123)  
INSERT OR IGNORE INTO customers (name, email, password_hash, points, total_earned, reviews_written, avatar_color) VALUES
('Alex Johnson', 'customer@demo.com', 'a6d6f8c6c0db8aad2f9a7d5e3b2c1f0e9d8c7b6a', 750, 1200, 8, '#6366f1');

-- Sample invitations
INSERT OR IGNORE INTO invitations (business_id, customer_email, customer_name, token, platform, status, points_offered, completed_at) VALUES
(1, 'customer@demo.com', 'Alex Johnson', 'inv_demo_001', 'google', 'completed', 150, datetime('now', '-5 days')),
(1, 'jane@example.com', 'Jane Smith', 'inv_demo_002', 'trustpilot', 'pending', 100, NULL),
(1, 'mike@example.com', 'Mike Wilson', 'inv_demo_003', 'google', 'pending', 150, NULL);

-- Sample reviews
INSERT OR IGNORE INTO reviews (business_id, customer_id, customer_name, invitation_id, platform, rating, title, content, points_earned, verified) VALUES
(1, 1, 'Alex Johnson', 1, 'google', 5, 'Amazing coffee!', 'The best coffee shop in town. Staff is super friendly and the coffee is always perfect.', 150, 1),
(1, NULL, 'Sarah M.', NULL, 'google', 4, 'Great place', 'Really enjoyed my visit. Will definitely come back!', 0, 0),
(1, NULL, 'Tom K.', NULL, 'trustpilot', 5, 'Excellent service', 'Outstanding quality and service. Highly recommended!', 0, 0);

-- Point transactions for demo customer
INSERT OR IGNORE INTO point_transactions (customer_id, type, amount, description, balance_after) VALUES
(1, 'earn', 150, 'Review for Acme Coffee Co on google', 150),
(1, 'earn', 200, 'Bonus for detailed review', 350),
(1, 'earn', 150, 'Review for Main St Bakery on google', 500),
(1, 'earn', 250, 'Review for City Gym on yelp', 750);
