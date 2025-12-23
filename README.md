# 🐾 Petique Clinic – Backend Service

This repository contains the **backend service** for **Petique Clinic**, a scalable veterinary clinic management system.
It powers reservations, vaccinations, Managing all clinic data products and all Pet owner needs orders, notifications, authentication, and analytics for all client applications.

---

## 🚀 Backend Responsibilities

- Authentication & authorization (JWT, Google OAuth, OTP)
- Reservation & appointment lifecycle
- Pets & vaccination medical records
- Products, cart, orders & payments
- Notifications & reminders
- Admin & owner analytics
- File uploads & media processing

---

## 🧱 Tech Stack

- Node.js (ES6)
- Express.js
- MongoDB + Mongoose
- JWT Authentication
- Joi Validation
- Cloudinary (image storage)
- Stripe (payments)
- Nodemailer (emails)
- Twilio (SMS / WhatsApp)
- Node Cron / Node Schedule

---

## 📁 Project Structure

```text
PETIQUE-BACKEND/
│
├── database/
│   └── models/
│
├── src/
│   ├── middlewares/
│   ├── modules/
|         |__ All folders Crud
|         |__ bootstrap.js
|   |     |__ index.js
│   ├── schedulers/
│   ├── utils/
│   └── bootstrap.js
│
├── .env
├── index.js
├── package.json
└── README.md
```

---

## 🧩 Modular Architecture

Each feature is implemented as an isolated module:

```text
module-name/
├── module.controllers.js
├── module.routers.js
└── module.validation.js
```

### Benefits

- High scalability
- Clear separation of concerns
- Easy testing and maintenance

---

## 🔐 Authentication & Authorization

- JWT-based authentication
- Google OAuth login
- OTP verification
- Role-Based Access Control (RBAC)

### Supported Roles

- petOwner
- doctor
- admin
- owner

---

## 📅 Reservation & Appointment Flow

1. Pet owner creates a reservation
2. Availability is validated
3. Reservation status → **PENDING**
4. Doctor completes the visit
5. Vaccination & notes added
6. Status updated → **COMPLETED**

---

## 💉 Vaccination & Medical Records

- Linked to pet, doctor, and reservation
- Immutable medical history
- Editable by doctors
- Viewable by pet owners
- Auditable by owner

---

## 🔔 Notifications & Reminders

- Reservation reminders
- Vaccination reminders
- Order status updates
- Admin alerts
- Doctors alerts

### Delivery Channels

- In-app notifications
- Email
- SMS / WhatsApp

---

## 💳 Payments & Orders

- Stripe payment integration
- Secure payment intents

### Order Lifecycle

```text
PLACED → SHIPPING → COMPLETED
        → CANCELED / REFUNDED
```

---

🐾 **Petique Clinic Backend**  
Reliable • Secure • Scalable
