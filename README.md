 AI Expense Tracker

A full-stack AI-powered Expense Tracker built with HTML, CSS, JavaScript, Node.js, Express, MongoDB/Mongoose, JWT authentication, and OpenAI-compatible AI APIs.

The application allows users to create an account, log in securely, add and manage expenses, automatically categorize expenses using AI, and get AI-generated spending insights.

✨ Features

🔐 Authentication

User registration with email and password

Login with email and password

Password hashing with bcryptjs

JWT-based authentication

Persistent login using browser local storage

Logout functionality

Email validation and password length validation

💸 Expense Management

Add expenses with:

Amount

Description

Category

View all expenses

Delete expenses

Calculate total spending

Expense date display

Responsive expense dashboard

🤖 AI Features

Automatic expense category suggestion

AI-powered spending insights

Manual category selection is also available

AI requests are handled by the backend so the API key is not exposed in the frontend

🗄️ Database

MongoDB Atlas

Mongoose ODM

User and Expense models

Persistent expense and user data

🚀 Deployment

Vercel-compatible frontend build

Serverless API entry point

CORS configuration for deployed frontend/backend

Environment-variable based configuration

🛠️ Tech Stack

Frontend
HTML5
CSS3
Vanilla JavaScript
Vite

Backend
Node.js
Express.js
REST API
JWT
bcryptjs

Database
MongoDB Atlas
Mongoose

AI
OpenAI-compatible API
OpenRouter support
AI expense categorization
AI spending insights

Deployment
Vercel
GitHub

📁 Project Structure

AI-Expense-Tracker/
│
├── api/
│   └── index.js
│
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── aiController.js
│   │   ├── authController.js
│   │   └── expenseController.js
│   ├── middleware/
│   │   └── auth.js
│   ├── models/
│   │   ├── Expense.js
│   │   └── User.js
│   ├── routes/
│   │   ├── aiRoutes.js
│   │   ├── authRoutes.js
│   │   └── expenseRoutes.js
│   ├── services/
│   │   └── aiService.js
│   ├── utils/
│   │   └── db.js
│   ├── app.js
│   └── server.js
│
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
├── .gitignore
├── package.json
├── package-lock.json
├── vercel.json
└── README.md

⚙️ Prerequisites

Make sure you have installed:

Node.js
npm
Git

A MongoDB Atlas database
An OpenRouter/OpenAI-compatible API key for AI features

🚀 Run Locally

1. Clone the repository

git clone https://github.com/Sujalyadav-150/Expense-tracker-app.git

cd Expense-tracker-app

2. Install dependencies

npm install

3. Configure environment variables

Create:

backend/.env

Use backend/.env.example as a template.

Required production-style variables include:

MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/expense_tracker
OPENROUTER_API_KEY=your_openrouter_api_key
JWT_SECRET=replace_with_a_long_random_secret
PREMIUM_EMAILS=premium@example.com
CORS_ORIGINS=http://localhost:5173

Never commit .env or API keys to GitHub.

4. Start the backend

npm start

The backend will run on:

http://localhost:5000

5. Start the frontend

npm run build

For local frontend development, use a static/Vite development server as appropriate for your setup.

🔑 Authentication Flow

Registration

The user provides:

Email
Password

The password is hashed using bcryptjs before it is stored.

Login

The user provides:

Email
Password

After successful authentication, the backend returns a JWT token.

The frontend stores the authentication token in browser local storage and sends it with protected requests.

Example:

Authorization: Bearer <JWT_TOKEN>

🤖 AI Expense Categorization

If the user does not manually select a category, the application can use the backend AI service to suggest a category.

If AI categorization fails, the application safely falls back to:

Other

📊 AI Spending Insight

The application can analyze stored expenses and generate an AI-based spending insight.

🔌 REST API

Authentication

POST /api/auth/register

POST /api/auth/login

Expenses

GET /api/expenses

POST /api/expenses

DELETE /api/expenses/:id

Premium Leaderboard

AI

POST /api/ai/categorize

GET /api/ai/insight

Health

GET /api/health

A successful production health response should report the backend status and, in the latest deployment, the database connection status.

🌐 Deployment

The project includes a vercel.json configuration for Vercel deployment.

Production environment variables should be configured in Vercel:

MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_secure_secret
OPENROUTER_API_KEY=your_openrouter_api_key

Do not expose private backend secrets in frontend environment variables.

MongoDB Atlas must also allow connections from the deployed serverless application through its Network Access configuration.

🔒 Security

Password hashing with bcryptjs
JWT authentication
Backend-only AI API key
.env excluded from Git
MongoDB credentials excluded from Git
CORS configuration
Input validation
Protected API endpoints

Important

Do not upload:

.env
API keys
JWT secrets
database credentials

to GitHub.

📌 Performance

The backend reuses cached MongoDB connections for serverless invocations and returns saved expense records directly after creation so the dashboard updates immediately.

📌 Future Improvements

Possible improvements include:

Edit expense functionality
Monthly/yearly expense reports
Expense charts and visual analytics
Budget limits and notifications
Password reset through email
Refresh-token based authentication
More advanced AI financial recommendations
Export expenses to CSV/PDF
Improved role and permission management

👨‍💻 Author

Sujal Yadav

GitHub:
https://github.com/Sujalyadav-150

Project Repository:
https://github.com/Sujalyadav-150/Expense-tracker-app
