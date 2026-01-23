# Just-Emart Backend

Backend API server for the Just-Emart e-commerce platform.

## Features

- MongoDB database integration
- RESTful API endpoints
- User authentication
- Product management
- Shopping cart
- Wishlist
- Order processing

## Installation

```bash
cd backend
npm install
```

## Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=5000
DB_USERNAME=your_mongodb_username
DB_PASSWORD=your_mongodb_password
```

## Running the Server

Development mode with auto-reload:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## API Endpoints

### Products

- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID

### Users

- `POST /api/users/register` - Register new user
- `GET /api/users/:email` - Get user by email

### Cart

- `GET /api/cart/:email` - Get user's cart
- `POST /api/cart/:email` - Add item to cart
- `PATCH /api/cart/:email/:productId` - Update cart item quantity
- `DELETE /api/cart/:email/:productId` - Remove item from cart
- `DELETE /api/cart/:email` - Clear cart

### Wishlist

- `GET /api/wishlist/:email` - Get user's wishlist
- `POST /api/wishlist/:email` - Add item to wishlist
- `DELETE /api/wishlist/:email/:productId` - Remove item from wishlist

### Orders

- `GET /api/orders/:email` - Get user's orders
- `POST /api/orders` - Create new order

### Stats

- `GET /api/stats` - Get platform statistics

## Database Collections

- `products` - Product listings
- `users` - User accounts
- `carts` - Shopping carts
- `wishlists` - User wishlists
- `orders` - Order history

## Technologies

- Node.js
- Express.js
- MongoDB
- CORS
- dotenv
