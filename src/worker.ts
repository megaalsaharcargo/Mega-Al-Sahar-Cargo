import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  STRIPE_SECRET_KEY?: string
  PAYPAL_CLIENT_ID?: string
  PAYPAL_CLIENT_SECRET?: string
  JWT_SECRET?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('*', cors({ origin: '*', allowMethods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'] }))

// ─── Utilities ───────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  // Simple hash for demo – in production use bcrypt via Workers
  let hash = 0
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

function generateToken(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  for (let i = 0; i < len; i++) result += chars[arr[i] % chars.length]
  return result
}

async function getSession(db: D1Database, token: string) {
  if (!token) return null
  const session = await db.prepare(
    'SELECT s.*, s.user_type FROM sessions s WHERE s.token = ? AND s.expires_at > datetime("now")'
  ).bind(token).first<any>()
  return session
}

async function ensureDB(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, industry TEXT DEFAULT 'Other', website TEXT, phone TEXT,
      logo_url TEXT, google_url TEXT, trustpilot_url TEXT, facebook_url TEXT, yelp_url TEXT,
      tripadvisor_url TEXT, plan TEXT DEFAULT 'starter', invite_count INTEGER DEFAULT 0,
      monthly_invites_used INTEGER DEFAULT 0, stripe_customer_id TEXT, stripe_subscription_id TEXT,
      is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, phone TEXT, points INTEGER DEFAULT 0,
      total_earned INTEGER DEFAULT 0, total_redeemed INTEGER DEFAULT 0,
      reviews_written INTEGER DEFAULT 0, avatar_color TEXT DEFAULT '#6366f1',
      paypal_email TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE NOT NULL,
      user_type TEXT NOT NULL, user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL,
      customer_email TEXT NOT NULL, customer_name TEXT, token TEXT UNIQUE NOT NULL,
      platform TEXT DEFAULT 'google', status TEXT DEFAULT 'pending',
      points_offered INTEGER DEFAULT 100, message TEXT, expires_at DATETIME,
      completed_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL,
      customer_id INTEGER, customer_name TEXT NOT NULL, invitation_id INTEGER,
      platform TEXT NOT NULL, rating INTEGER NOT NULL, title TEXT, content TEXT NOT NULL,
      points_earned INTEGER DEFAULT 0, verified INTEGER DEFAULT 0,
      business_response TEXT, responded_at DATETIME, helpful_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL,
      type TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT,
      reference_id INTEGER, balance_after INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reward_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
      points_required INTEGER NOT NULL, reward_type TEXT NOT NULL,
      reward_value REAL NOT NULL, reward_currency TEXT DEFAULT 'USD',
      is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL,
      reward_tier_id INTEGER NOT NULL, points_used INTEGER NOT NULL,
      reward_value REAL NOT NULL, status TEXT DEFAULT 'pending',
      payout_method TEXT DEFAULT 'paypal', payout_email TEXT, payout_reference TEXT,
      processed_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL,
      amount REAL NOT NULL, currency TEXT DEFAULT 'USD', plan TEXT NOT NULL,
      status TEXT DEFAULT 'pending', stripe_payment_intent TEXT,
      stripe_subscription_id TEXT, description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin', is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
  ])

  // Clean up duplicates if any
  await db.prepare(`DELETE FROM reward_tiers WHERE id NOT IN (SELECT MIN(id) FROM reward_tiers GROUP BY name)`).run().catch(() => {})

  // Insert default data
  await db.batch([
    db.prepare(`INSERT INTO admin_users (name, email, password_hash, role) SELECT 'Admin','admin@reviewgate.com','${hashPassword('admin123')}','superadmin' WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE email='admin@reviewgate.com')`),
    db.prepare(`INSERT INTO reward_tiers (name, description, points_required, reward_type, reward_value) SELECT 'Coffee Break','Get $5 via PayPal',500,'paypal',5.00 WHERE NOT EXISTS (SELECT 1 FROM reward_tiers WHERE name='Coffee Break')`),
    db.prepare(`INSERT INTO reward_tiers (name, description, points_required, reward_type, reward_value) SELECT 'Lunch Money','Get $10 via PayPal',1000,'paypal',10.00 WHERE NOT EXISTS (SELECT 1 FROM reward_tiers WHERE name='Lunch Money')`),
    db.prepare(`INSERT INTO reward_tiers (name, description, points_required, reward_type, reward_value) SELECT 'Shopping Fund','Get $25 via PayPal',2500,'paypal',25.00 WHERE NOT EXISTS (SELECT 1 FROM reward_tiers WHERE name='Shopping Fund')`),
    db.prepare(`INSERT INTO reward_tiers (name, description, points_required, reward_type, reward_value) SELECT 'Big Reward','Get $50 via PayPal',5000,'paypal',50.00 WHERE NOT EXISTS (SELECT 1 FROM reward_tiers WHERE name='Big Reward')`),
    db.prepare(`INSERT INTO reward_tiers (name, description, points_required, reward_type, reward_value) SELECT 'Premium Cash','Get $100 via PayPal',10000,'paypal',100.00 WHERE NOT EXISTS (SELECT 1 FROM reward_tiers WHERE name='Premium Cash')`),
    db.prepare(`INSERT INTO businesses (name, email, password_hash, industry, plan, google_url) SELECT 'Acme Coffee Co','business@demo.com','${hashPassword('demo123')}','Food & Beverage','growth','https://g.page/acmecoffee' WHERE NOT EXISTS (SELECT 1 FROM businesses WHERE email='business@demo.com')`),
    db.prepare(`INSERT INTO customers (name, email, password_hash, points, total_earned, reviews_written) SELECT 'Alex Johnson','customer@demo.com','${hashPassword('demo123')}',750,1200,8 WHERE NOT EXISTS (SELECT 1 FROM customers WHERE email='customer@demo.com')`)
  ])
}

let dbInitialized = false

// ─── Static Files ─────────────────────────────────────────────────────────────

// ─── API: Stats ───────────────────────────────────────────────────────────────

app.get('/api/stats', async (c) => {
  try {
    if (!dbInitialized) { await ensureDB(c.env.DB); dbInitialized = true }
    const [biz, rev, cust] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM businesses').first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM reviews').first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM customers').first<any>()
    ])
    return c.json({ businesses: biz?.count || 0, reviews: rev?.count || 0, customers: cust?.count || 0 })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── API: Auth ────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (c) => {
  try {
    if (!dbInitialized) { await ensureDB(c.env.DB); dbInitialized = true }
    const body = await c.req.json()
    const { name, email, password, type, industry, website } = body

    if (!name || !email || !password || !type) return c.json({ error: 'Missing required fields' }, 400)
    if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

    const table = type === 'business' ? 'businesses' : type === 'admin' ? 'admin_users' : 'customers'
    const existing = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE email = ?`).bind(email).first()
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    const hash = hashPassword(password)
    let userId: number

    if (type === 'business') {
      const result = await c.env.DB.prepare(
        'INSERT INTO businesses (name, email, password_hash, industry, website) VALUES (?, ?, ?, ?, ?)'
      ).bind(name, email, hash, industry || 'Other', website || '').run()
      userId = result.meta.last_row_id as number
    } else {
      const colors = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#10b981']
      const color = colors[Math.floor(Math.random() * colors.length)]
      const result = await c.env.DB.prepare(
        'INSERT INTO customers (name, email, password_hash, avatar_color) VALUES (?, ?, ?, ?)'
      ).bind(name, email, hash, color).run()
      userId = result.meta.last_row_id as number
    }

    const token = generateToken(32)
    await c.env.DB.prepare(
      'INSERT INTO sessions (token, user_type, user_id, expires_at) VALUES (?, ?, ?, datetime("now", "+30 days"))'
    ).bind(token, type, userId).run()

    const user = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(userId).first<any>()
    return c.json({ token, user: { ...user, password_hash: undefined }, type })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    if (!dbInitialized) { await ensureDB(c.env.DB); dbInitialized = true }
    const { email, password, type } = await c.req.json()
    if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

    const table = type === 'business' ? 'businesses' : type === 'admin' ? 'admin_users' : 'customers'
    const hash = hashPassword(password)
    const user = await c.env.DB.prepare(
      `SELECT * FROM ${table} WHERE email = ? AND password_hash = ?`
    ).bind(email, hash).first<any>()

    if (!user) return c.json({ error: 'Invalid email or password' }, 401)
    if (user.is_active === 0) return c.json({ error: 'Account suspended' }, 403)

    const token = generateToken(32)
    await c.env.DB.prepare(
      'INSERT INTO sessions (token, user_type, user_id, expires_at) VALUES (?, ?, ?, datetime("now", "+30 days"))'
    ).bind(token, type || 'customer', user.id).run()

    return c.json({ token, user: { ...user, password_hash: undefined }, type: type || 'customer' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/auth/me', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!token) return c.json({ error: 'No token' }, 401)
    const session = await getSession(c.env.DB, token)
    if (!session) return c.json({ error: 'Invalid or expired session' }, 401)

    const table = session.user_type === 'business' ? 'businesses' : session.user_type === 'admin' ? 'admin_users' : 'customers'
    const user = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(session.user_id).first<any>()
    if (!user) return c.json({ error: 'User not found' }, 404)
    return c.json({ ...user, password_hash: undefined, user_type: session.user_type })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/auth/logout', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── API: Business Dashboard ──────────────────────────────────────────────────

app.get('/api/business/dashboard', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const bizId = session.user_id
    const [biz, totalReviews, avgRating, totalInvites, pendingInvites, recentReviews] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(bizId).first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM reviews WHERE business_id = ?').bind(bizId).first<any>(),
      c.env.DB.prepare('SELECT AVG(rating) as avg FROM reviews WHERE business_id = ?').bind(bizId).first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM invitations WHERE business_id = ?').bind(bizId).first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM invitations WHERE business_id = ? AND status = "pending"').bind(bizId).first<any>(),
      c.env.DB.prepare('SELECT * FROM reviews WHERE business_id = ? ORDER BY created_at DESC LIMIT 5').bind(bizId).all<any>()
    ])

    const conversionRate = totalInvites?.count > 0 
      ? Math.round((totalReviews?.count / totalInvites?.count) * 100) 
      : 0

    return c.json({
      business: { ...biz, password_hash: undefined },
      stats: {
        totalReviews: totalReviews?.count || 0,
        avgRating: avgRating?.avg ? Math.round(avgRating.avg * 10) / 10 : 0,
        totalInvites: totalInvites?.count || 0,
        pendingInvites: pendingInvites?.count || 0,
        conversionRate
      },
      recentReviews: recentReviews.results
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/business/reviews', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const reviews = await c.env.DB.prepare(
      'SELECT * FROM reviews WHERE business_id = ? ORDER BY created_at DESC'
    ).bind(session.user_id).all<any>()

    return c.json(reviews.results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/business/reviews/:id/respond', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const { response } = await c.req.json()
    const reviewId = c.req.param('id')
    await c.env.DB.prepare(
      'UPDATE reviews SET business_response = ?, responded_at = datetime("now") WHERE id = ? AND business_id = ?'
    ).bind(response, reviewId, session.user_id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/business/invitations', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const invites = await c.env.DB.prepare(
      'SELECT * FROM invitations WHERE business_id = ? ORDER BY created_at DESC'
    ).bind(session.user_id).all<any>()
    return c.json(invites.results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/business/invite', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const { customer_email, customer_name, platform, points_offered, message } = await c.req.json()
    if (!customer_email) return c.json({ error: 'Customer email required' }, 400)

    const biz = await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(session.user_id).first<any>()
    
    // Check plan limits
    const planLimits: Record<string, number> = { starter: 50, growth: 500, enterprise: 99999 }
    const limit = planLimits[biz.plan] || 50
    if (biz.monthly_invites_used >= limit) {
      return c.json({ error: `Monthly invite limit reached for ${biz.plan} plan. Upgrade to send more.` }, 429)
    }

    const invToken = generateToken(24)
    await c.env.DB.prepare(
      'INSERT INTO invitations (business_id, customer_email, customer_name, token, platform, points_offered, message, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now", "+7 days"))'
    ).bind(session.user_id, customer_email, customer_name || '', invToken, platform || 'google', points_offered || 100, message || '').run()

    await c.env.DB.prepare('UPDATE businesses SET monthly_invites_used = monthly_invites_used + 1, invite_count = invite_count + 1 WHERE id = ?').bind(session.user_id).run()

    return c.json({ 
      success: true, 
      token: invToken, 
      review_link: `/review/${invToken}`,
      message: `Invitation sent to ${customer_email}`
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/business/invite/bulk', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const { customers, platform, points_offered, message } = await c.req.json()
    if (!customers || !Array.isArray(customers)) return c.json({ error: 'Customers array required' }, 400)

    const results = []
    for (const cust of customers) {
      const invToken = generateToken(24)
      await c.env.DB.prepare(
        'INSERT INTO invitations (business_id, customer_email, customer_name, token, platform, points_offered, message, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now", "+7 days"))'
      ).bind(session.user_id, cust.email, cust.name || '', invToken, platform || 'google', points_offered || 100, message || '').run()
      results.push({ email: cust.email, token: invToken, link: `/review/${invToken}` })
    }
    await c.env.DB.prepare('UPDATE businesses SET monthly_invites_used = monthly_invites_used + ?, invite_count = invite_count + ? WHERE id = ?').bind(customers.length, customers.length, session.user_id).run()
    return c.json({ success: true, sent: results.length, results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/business/analytics', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const bizId = session.user_id
    const [ratingDist, platformDist, monthlyTrend] = await Promise.all([
      c.env.DB.prepare('SELECT rating, COUNT(*) as count FROM reviews WHERE business_id = ? GROUP BY rating ORDER BY rating').bind(bizId).all<any>(),
      c.env.DB.prepare('SELECT platform, COUNT(*) as count FROM reviews WHERE business_id = ? GROUP BY platform').bind(bizId).all<any>(),
      c.env.DB.prepare('SELECT strftime("%Y-%m", created_at) as month, COUNT(*) as count, AVG(rating) as avg_rating FROM reviews WHERE business_id = ? GROUP BY month ORDER BY month DESC LIMIT 6').bind(bizId).all<any>()
    ])

    return c.json({
      ratingDistribution: ratingDist.results,
      platformDistribution: platformDist.results,
      monthlyTrend: monthlyTrend.results
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.put('/api/business/profile', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const { name, industry, website, phone, google_url, trustpilot_url, facebook_url, yelp_url, tripadvisor_url } = await c.req.json()
    await c.env.DB.prepare(
      'UPDATE businesses SET name=?, industry=?, website=?, phone=?, google_url=?, trustpilot_url=?, facebook_url=?, yelp_url=?, tripadvisor_url=? WHERE id=?'
    ).bind(name, industry, website, phone, google_url, trustpilot_url, facebook_url, yelp_url, tripadvisor_url, session.user_id).run()

    const updated = await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(session.user_id).first<any>()
    return c.json({ ...updated, password_hash: undefined })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── API: Review Page ─────────────────────────────────────────────────────────

app.get('/api/review/:token', async (c) => {
  try {
    if (!dbInitialized) { await ensureDB(c.env.DB); dbInitialized = true }
    const token = c.req.param('token')
    const inv = await c.env.DB.prepare(
      'SELECT i.*, b.name as business_name, b.industry FROM invitations i JOIN businesses b ON i.business_id = b.id WHERE i.token = ?'
    ).bind(token).first<any>()
    if (!inv) return c.json({ error: 'Invalid invitation' }, 404)
    if (inv.status === 'completed') return c.json({ error: 'Review already submitted' }, 409)
    return c.json(inv)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/review/:token/submit', async (c) => {
  try {
    if (!dbInitialized) { await ensureDB(c.env.DB); dbInitialized = true }
    const invToken = c.req.param('token')
    const { rating, title, content, customer_name, customer_email } = await c.req.json()

    if (!rating || !content) return c.json({ error: 'Rating and content required' }, 400)

    const inv = await c.env.DB.prepare('SELECT * FROM invitations WHERE token = ?').bind(invToken).first<any>()
    if (!inv) return c.json({ error: 'Invalid invitation' }, 404)
    if (inv.status === 'completed') return c.json({ error: 'Review already submitted' }, 409)

    // Find or create customer
    let customerId: number | null = null
    const email = customer_email || inv.customer_email
    if (email) {
      let cust = await c.env.DB.prepare('SELECT * FROM customers WHERE email = ?').bind(email).first<any>()
      if (!cust) {
        const colors = ['#6366f1','#8b5cf6','#ec4899','#14b8a6']
        const result = await c.env.DB.prepare(
          'INSERT INTO customers (name, email, password_hash, avatar_color) VALUES (?, ?, ?, ?)'
        ).bind(customer_name || inv.customer_name || 'Anonymous', email, hashPassword(generateToken(8)), colors[0]).run()
        customerId = result.meta.last_row_id as number
        cust = { id: customerId, points: 0 }
      } else {
        customerId = cust.id
      }

      // Award points
      const pts = inv.points_offered || 100
      await c.env.DB.prepare(
        'UPDATE customers SET points = points + ?, total_earned = total_earned + ?, reviews_written = reviews_written + 1 WHERE id = ?'
      ).bind(pts, pts, customerId).run()
      const updated = await c.env.DB.prepare('SELECT points FROM customers WHERE id = ?').bind(customerId).first<any>()
      await c.env.DB.prepare(
        'INSERT INTO point_transactions (customer_id, type, amount, description, reference_id, balance_after) VALUES (?, "earn", ?, ?, ?, ?)'
      ).bind(customerId, pts, `Review for business on ${inv.platform}`, inv.id, updated?.points || pts).run()
    }

    const result = await c.env.DB.prepare(
      'INSERT INTO reviews (business_id, customer_id, customer_name, invitation_id, platform, rating, title, content, points_earned, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(inv.business_id, customerId, customer_name || inv.customer_name || 'Anonymous', inv.id, inv.platform, rating, title || '', content, inv.points_offered || 100).run()

    await c.env.DB.prepare('UPDATE invitations SET status = "completed", completed_at = datetime("now") WHERE token = ?').bind(invToken).run()

    return c.json({ 
      success: true, 
      points_earned: inv.points_offered || 100,
      review_id: result.meta.last_row_id
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── API: Customer Dashboard ──────────────────────────────────────────────────

app.get('/api/customer/dashboard', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'customer') return c.json({ error: 'Unauthorized' }, 401)

    const custId = session.user_id
    const [cust, recentTx, recentReviews, pendingInvites, rewards] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(custId).first<any>(),
      c.env.DB.prepare('SELECT * FROM point_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10').bind(custId).all<any>(),
      c.env.DB.prepare('SELECT r.*, b.name as business_name FROM reviews r JOIN businesses b ON r.business_id = b.id WHERE r.customer_id = ? ORDER BY r.created_at DESC LIMIT 5').bind(custId).all<any>(),
      c.env.DB.prepare('SELECT i.*, b.name as business_name FROM invitations i JOIN businesses b ON i.business_id = b.id WHERE i.customer_email = ? AND i.status = "pending"').bind('').all<any>(),
      c.env.DB.prepare('SELECT * FROM reward_tiers WHERE is_active = 1 ORDER BY points_required ASC').all<any>()
    ])

    // Fix pending invites query with actual email
    const custEmail = cust?.email || ''
    const pendingInv = await c.env.DB.prepare(
      'SELECT i.*, b.name as business_name FROM invitations i JOIN businesses b ON i.business_id = b.id WHERE i.customer_email = ? AND i.status = "pending"'
    ).bind(custEmail).all<any>()

    return c.json({
      customer: { ...cust, password_hash: undefined },
      recentTransactions: recentTx.results,
      recentReviews: recentReviews.results,
      pendingInvites: pendingInv.results,
      rewards: rewards.results
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/customer/points', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'customer') return c.json({ error: 'Unauthorized' }, 401)

    const [cust, transactions] = await Promise.all([
      c.env.DB.prepare('SELECT points, total_earned, total_redeemed FROM customers WHERE id = ?').bind(session.user_id).first<any>(),
      c.env.DB.prepare('SELECT * FROM point_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').bind(session.user_id).all<any>()
    ])
    return c.json({ ...cust, transactions: transactions.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/customer/reviews', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'customer') return c.json({ error: 'Unauthorized' }, 401)

    const reviews = await c.env.DB.prepare(
      'SELECT r.*, b.name as business_name FROM reviews r JOIN businesses b ON r.business_id = b.id WHERE r.customer_id = ? ORDER BY r.created_at DESC'
    ).bind(session.user_id).all<any>()
    return c.json(reviews.results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/customer/invitations', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'customer') return c.json({ error: 'Unauthorized' }, 401)

    const cust = await c.env.DB.prepare('SELECT email FROM customers WHERE id = ?').bind(session.user_id).first<any>()
    const invites = await c.env.DB.prepare(
      'SELECT i.*, b.name as business_name FROM invitations i JOIN businesses b ON i.business_id = b.id WHERE i.customer_email = ? ORDER BY i.created_at DESC'
    ).bind(cust?.email || '').all<any>()
    return c.json(invites.results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/rewards', async (c) => {
  try {
    if (!dbInitialized) { await ensureDB(c.env.DB); dbInitialized = true }
    const rewards = await c.env.DB.prepare('SELECT * FROM reward_tiers WHERE is_active = 1 ORDER BY points_required ASC').all<any>()
    return c.json(rewards.results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/customer/redeem', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'customer') return c.json({ error: 'Unauthorized' }, 401)

    const { tier_id, payout_email, payout_method } = await c.req.json()
    if (!tier_id || !payout_email) return c.json({ error: 'Tier ID and payout email required' }, 400)

    const [cust, tier] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(session.user_id).first<any>(),
      c.env.DB.prepare('SELECT * FROM reward_tiers WHERE id = ? AND is_active = 1').bind(tier_id).first<any>()
    ])

    if (!tier) return c.json({ error: 'Reward tier not found' }, 404)
    if (cust.points < tier.points_required) return c.json({ error: 'Insufficient points' }, 400)

    const result = await c.env.DB.prepare(
      'INSERT INTO redemptions (customer_id, reward_tier_id, points_used, reward_value, payout_method, payout_email) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(session.user_id, tier_id, tier.points_required, tier.reward_value, payout_method || 'paypal', payout_email).run()

    await c.env.DB.prepare(
      'UPDATE customers SET points = points - ?, total_redeemed = total_redeemed + ? WHERE id = ?'
    ).bind(tier.points_required, tier.points_required, session.user_id).run()

    const updatedCust = await c.env.DB.prepare('SELECT points FROM customers WHERE id = ?').bind(session.user_id).first<any>()
    await c.env.DB.prepare(
      'INSERT INTO point_transactions (customer_id, type, amount, description, reference_id, balance_after) VALUES (?, "redeem", ?, ?, ?, ?)'
    ).bind(session.user_id, -tier.points_required, `Redeemed: ${tier.name}`, result.meta.last_row_id, updatedCust?.points || 0).run()

    return c.json({ 
      success: true, 
      redemption_id: result.meta.last_row_id,
      reward_value: tier.reward_value,
      message: `$${tier.reward_value} payout request submitted! You'll receive payment within 1-3 business days.`
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.put('/api/customer/profile', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'customer') return c.json({ error: 'Unauthorized' }, 401)

    const { name, phone, paypal_email } = await c.req.json()
    await c.env.DB.prepare(
      'UPDATE customers SET name=?, phone=?, paypal_email=? WHERE id=?'
    ).bind(name, phone, paypal_email, session.user_id).run()

    const updated = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(session.user_id).first<any>()
    return c.json({ ...updated, password_hash: undefined })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── API: Admin ───────────────────────────────────────────────────────────────

app.get('/api/admin/overview', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const [businesses, customers, reviews, redemptions, revenue, pendingRedemptions] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM businesses').first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM customers').first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM reviews').first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM redemptions').first<any>(),
      c.env.DB.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = "completed"').first<any>(),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM redemptions WHERE status = "pending"').first<any>()
    ])

    return c.json({
      businesses: businesses?.count || 0,
      customers: customers?.count || 0,
      reviews: reviews?.count || 0,
      redemptions: redemptions?.count || 0,
      revenue: revenue?.total || 0,
      pendingRedemptions: pendingRedemptions?.count || 0
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/admin/businesses', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const businesses = await c.env.DB.prepare(
      'SELECT b.*, (SELECT COUNT(*) FROM reviews WHERE business_id = b.id) as review_count FROM businesses b ORDER BY created_at DESC'
    ).all<any>()
    return c.json(businesses.results.map((b: any) => ({ ...b, password_hash: undefined })))
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/admin/customers', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const customers = await c.env.DB.prepare(
      'SELECT * FROM customers ORDER BY created_at DESC'
    ).all<any>()
    return c.json(customers.results.map((c: any) => ({ ...c, password_hash: undefined })))
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/admin/reviews', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const reviews = await c.env.DB.prepare(
      'SELECT r.*, b.name as business_name FROM reviews r JOIN businesses b ON r.business_id = b.id ORDER BY r.created_at DESC LIMIT 100'
    ).all<any>()
    return c.json(reviews.results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/admin/redemptions', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const redemptions = await c.env.DB.prepare(
      'SELECT r.*, c.name as customer_name, c.email as customer_email, t.name as tier_name FROM redemptions r JOIN customers c ON r.customer_id = c.id JOIN reward_tiers t ON r.reward_tier_id = t.id ORDER BY r.created_at DESC'
    ).all<any>()
    return c.json(redemptions.results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/admin/redemptions/:id/process', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const { status, payout_reference } = await c.req.json()
    const id = c.req.param('id')
    await c.env.DB.prepare(
      'UPDATE redemptions SET status = ?, payout_reference = ?, processed_at = datetime("now") WHERE id = ?'
    ).bind(status, payout_reference || '', id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.patch('/api/admin/businesses/:id/status', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const { is_active } = await c.req.json()
    await c.env.DB.prepare('UPDATE businesses SET is_active = ? WHERE id = ?').bind(is_active, c.req.param('id')).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.patch('/api/admin/customers/:id/status', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const { is_active } = await c.req.json()
    await c.env.DB.prepare('UPDATE customers SET is_active = ? WHERE id = ?').bind(is_active, c.req.param('id')).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/admin/reward-tiers', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const tiers = await c.env.DB.prepare('SELECT * FROM reward_tiers ORDER BY points_required ASC').all<any>()
    return c.json(tiers.results)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/admin/reward-tiers', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const { name, description, points_required, reward_type, reward_value } = await c.req.json()
    const result = await c.env.DB.prepare(
      'INSERT INTO reward_tiers (name, description, points_required, reward_type, reward_value) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, description, points_required, reward_type, reward_value).run()
    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── API: Payments ────────────────────────────────────────────────────────────

app.post('/api/payments/create-intent', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const { plan } = await c.req.json()
    const prices: Record<string, number> = { growth: 4900, enterprise: 19900 }
    const amount = prices[plan]
    if (!amount) return c.json({ error: 'Invalid plan' }, 400)

    // If Stripe key is configured, use Stripe; otherwise return mock
    if (c.env.STRIPE_SECRET_KEY) {
      const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          amount: amount.toString(),
          currency: 'usd',
          'metadata[plan]': plan,
          'metadata[business_id]': session.user_id.toString()
        })
      })
      const intent = await stripeRes.json() as any
      await c.env.DB.prepare(
        'INSERT INTO payments (business_id, amount, plan, stripe_payment_intent) VALUES (?, ?, ?, ?)'
      ).bind(session.user_id, amount / 100, plan, intent.id).run()
      return c.json({ client_secret: intent.client_secret, payment_intent_id: intent.id })
    }

    // Mock response for demo
    const mockId = `pi_mock_${generateToken(16)}`
    await c.env.DB.prepare(
      'INSERT INTO payments (business_id, amount, plan, stripe_payment_intent, status) VALUES (?, ?, ?, ?, "demo")'
    ).bind(session.user_id, amount / 100, plan, mockId).run()
    return c.json({ 
      client_secret: `mock_secret_${mockId}`,
      payment_intent_id: mockId,
      demo: true,
      message: 'Demo mode: Add STRIPE_SECRET_KEY to enable real payments'
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/payments/confirm', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'business') return c.json({ error: 'Unauthorized' }, 401)

    const { payment_intent_id, plan } = await c.req.json()
    await c.env.DB.prepare('UPDATE payments SET status = "completed" WHERE stripe_payment_intent = ?').bind(payment_intent_id).run()
    await c.env.DB.prepare('UPDATE businesses SET plan = ?, monthly_invites_used = 0 WHERE id = ?').bind(plan, session.user_id).run()
    return c.json({ success: true, plan })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.post('/api/payments/paypal/payout', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const session = await getSession(c.env.DB, token || '')
    if (!session || session.user_type !== 'admin') return c.json({ error: 'Unauthorized' }, 401)

    const { redemption_id } = await c.req.json()
    const redemption = await c.env.DB.prepare('SELECT * FROM redemptions WHERE id = ?').bind(redemption_id).first<any>()
    if (!redemption) return c.json({ error: 'Redemption not found' }, 404)

    if (c.env.PAYPAL_CLIENT_ID && c.env.PAYPAL_CLIENT_SECRET) {
      // Get PayPal access token
      const authRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${c.env.PAYPAL_CLIENT_ID}:${c.env.PAYPAL_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      })
      const auth = await authRes.json() as any

      const payoutRes = await fetch('https://api-m.sandbox.paypal.com/v1/payments/payouts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender_batch_header: { sender_batch_id: `RG_${redemption_id}_${Date.now()}`, email_subject: 'You have a payment from ReviewGate!' },
          items: [{ recipient_type: 'EMAIL', amount: { value: redemption.reward_value.toFixed(2), currency: 'USD' }, receiver: redemption.payout_email, note: 'ReviewGate reward payout' }]
        })
      })
      const payout = await payoutRes.json() as any
      await c.env.DB.prepare('UPDATE redemptions SET status = "completed", payout_reference = ?, processed_at = datetime("now") WHERE id = ?').bind(payout.batch_header?.payout_batch_id || 'paypal_sent', redemption_id).run()
      return c.json({ success: true, payout_batch_id: payout.batch_header?.payout_batch_id })
    }

    // Demo mode
    await c.env.DB.prepare('UPDATE redemptions SET status = "completed", payout_reference = "demo_payout", processed_at = datetime("now") WHERE id = ?').bind(redemption_id).run()
    return c.json({ success: true, demo: true, message: 'Demo mode: Add PAYPAL credentials to enable real payouts' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ─── Static file serving ──────────────────────────────────────────────────────

app.get('/review/:token', async (c) => {
  if (!dbInitialized) { await ensureDB(c.env.DB); dbInitialized = true }
  return c.redirect(`/review.html?token=${c.req.param('token')}`)
})

export default app
