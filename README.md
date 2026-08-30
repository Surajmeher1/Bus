# 🚌 Smart University Bus Tracking System

A full-stack, real-time university bus tracking system with three dedicated portals — **Student**, **Bus Manager**, and **Admin** — built with Node.js, Express, Socket.IO, SQLite, and Leaflet.js.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ (v24 recommended)
- **npm** v9+

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Initialize the Database (first time only)
```bash
npm run init-db
```
This creates `backend/database/bustrack.db` with all tables and demo seed data.

### 3. Start the Server
```bash
npm start
# OR for development with auto-reload:
npm run dev
```

### 4. Open the Application
Visit: **http://localhost:5000**

---

## 🔑 Default Login Credentials

| Portal | Email / Username | Password |
|--------|-----------------|----------|
| **Admin** | `admin` | `Admin@123` |
| **Bus Manager 1** | `rajesh@university.edu` | `Manager@123` |
| **Bus Manager 2** | `priya@university.edu` | `Manager@123` |
| **Student 1** | `arjun@student.edu` | `Student@123` |
| **Student 2** | `sneha@student.edu` | `Student@123` |
| **Student 3** | `rahul@student.edu` | `Student@123` |
| **Student 4** | `ananya@student.edu` | `Student@123` |
| **Student 5** | `karthik@student.edu` | `Student@123` |

---

## 🗂️ Project Structure

```
Smart University Bus Tracking System Project/
├── backend/
│   ├── config/
│   │   ├── db.js              # SQLite database connection
│   │   └── jwt.js             # JWT configuration
│   ├── controllers/
│   │   ├── adminController.js
│   │   ├── authController.js
│   │   ├── busController.js
│   │   ├── driverController.js
│   │   ├── feedbackController.js
│   │   ├── managerController.js
│   │   ├── notificationController.js
│   │   ├── routeController.js
│   │   ├── studentController.js
│   │   └── tripController.js
│   ├── database/
│   │   └── initDb.js          # Schema + seed data
│   ├── middleware/
│   │   ├── auth.js            # JWT auth + role guard + activity logger
│   │   └── validate.js        # Input validation middleware
│   ├── models/                # Thin data access layer (SQLite)
│   ├── routes/
│   │   ├── admin.js           # /drivers, /managers
│   │   ├── auth.js            # /auth/student/login, /register, /manager/login, /admin/login
│   │   ├── bus.js             # /buses
│   │   ├── misc.js            # /notifications, /feedback, /stats, /reports, /activity-logs
│   │   ├── route.js           # /routes
│   │   ├── student.js         # /students
│   │   └── trip.js            # /trips
│   ├── socket/
│   │   └── trackingSocket.js  # Socket.IO real-time GPS simulation + broadcasting
│   ├── .env                   # Environment variables
│   ├── package.json
│   └── server.js              # Express + Socket.IO entry point
│
└── frontend/
    ├── assets/
    │   ├── css/
    │   │   └── main.css        # Complete design system (CSS variables, dark mode, components)
    │   └── js/
    │       ├── api.js           # Fetch wrapper + all API endpoint groups + Auth/Toast/Theme
    │       ├── map.js           # Leaflet map utilities + animated bus markers
    │       └── socket-client.js # Socket.IO client wrapper
    ├── pages/
    │   ├── student/
    │   │   ├── login.html
    │   │   ├── register.html
    │   │   └── dashboard.html   # Full student dashboard
    │   ├── manager/
    │   │   ├── login.html
    │   │   └── dashboard.html   # Bus manager control panel
    │   └── admin/
    │       ├── login.html
    │       └── dashboard.html   # Full admin panel
    └── index.html               # Landing page
```

---

## ✨ Features

### 🎓 Student Portal
| Feature | Description |
|---------|-------------|
| Live GPS Tracking | Watch buses move in real time on Leaflet map |
| ETA Per Stop | Estimated arrival time for each bus stop |
| Seat Availability | Live occupancy with progress bar |
| Bus Routes | Full route map with stop timeline |
| Schedule | Today's trips with status |
| Favorite Bus | Save and quick-track your usual bus |
| Notifications | Real-time alerts for delays/emergencies |
| Rate & Report | Star ratings and feedback submission |
| Emergency SOS | One-click campus emergency alert |
| Profile Management | Edit profile + change password |

### 🚌 Bus Manager Portal
| Feature | Description |
|---------|-------------|
| My Buses | View and manage assigned buses |
| Live Map | Real-time bus position view |
| Trip Management | Start/end trips with route + driver |
| Update Location | Manually update bus GPS coordinates |
| Update Status | Running / Delayed / Maintenance / Cancelled |
| Seat Management | Update available seat count |
| Fuel Records | Log fuel fill-ups with cost and odometer |
| Maintenance Records | Track servicing history |
| Student Feedback | View ratings per bus |
| Broadcast | Send notifications to all students |

### 🛡️ Admin Portal
| Feature | Description |
|---------|-------------|
| Dashboard | System-wide stats + Chart.js charts |
| Student Management | Add / search / delete students |
| Bus Management | Add / configure / delete buses |
| Driver Management | Add / delete drivers |
| Manager Management | Add / delete bus managers |
| Route Management | Create routes (stops added via DB) |
| Schedule | Today's full trip schedule |
| Reports | Bus utilization, route stats, dept chart |
| Notifications | Send to all/students/managers + emergency |
| Activity Logs | Full audit trail of all actions |
| Settings | Change admin password + system info |

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Vanilla CSS (CSS Variables), JavaScript |
| Maps | Leaflet.js + OpenStreetMap (free, no API key) |
| Real-time | Socket.IO WebSocket |
| Charts | Chart.js (CDN) |
| Backend | Node.js + Express.js |
| Database | SQLite via `better-sqlite3` |
| Authentication | JWT (jsonwebtoken) + bcryptjs |
| Validation | express-validator |
| Dev Server | nodemon |

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/student/login` | Student login |
| POST | `/api/v1/auth/student/register` | Student registration |
| POST | `/api/v1/auth/manager/login` | Manager login |
| POST | `/api/v1/auth/admin/login` | Admin login |

### Buses
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/api/v1/buses` | All |
| GET | `/api/v1/buses/locations` | All |
| GET | `/api/v1/buses/my-buses` | Manager |
| POST | `/api/v1/buses` | Admin |
| PUT | `/api/v1/buses/:id/location` | Manager |
| PUT | `/api/v1/buses/:id/status` | Manager |
| PUT | `/api/v1/buses/:id/seats` | Manager |
| GET/POST | `/api/v1/buses/:id/fuel` | Manager |
| GET/POST | `/api/v1/buses/:id/maintenance` | Manager |

### Real-time Socket.IO Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `bus-location-update` | Server → Client | GPS position broadcast every 3s |
| `bus-status-change` | Server → Client | Status change broadcast |
| `seat-update` | Server → Client | Available seat count change |
| `notification` | Server → Client | New notification pushed |
| `subscribe-bus` | Client → Server | Subscribe to a specific bus feed |
| `update-location` | Client → Server | Manager manually pushes location |

---

## 🌐 Environment Variables

Edit `backend/.env`:

```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRES_IN=24h
```

---

## 🚦 GPS Simulation

The server automatically simulates GPS movement for all buses:
- Buses move along their route stops in sequence
- Position is broadcast to all connected clients every **3 seconds**
- ETA is calculated dynamically based on distance and simulated speed
- Markers animate smoothly on the map using `requestAnimationFrame`

---

## 🎨 Design

- **Theme**: Blue & white university theme with dark mode support
- **CSS**: Custom design system using CSS variables — no frameworks
- **Typography**: Inter (Google Fonts)
- **Icons**: Font Awesome 6
- **Layout**: Collapsible sidebar dashboard, responsive grid
- **Effects**: Glassmorphism, micro-animations, smooth transitions

---

## 📝 License

Academic project — Smart University Bus Tracking System  
Final Year Engineering Project
