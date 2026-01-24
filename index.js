const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.4ofgl6a.mongodb.net/?appName=Cluster0`;

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("✅ Successfully connected to MongoDB!");

    const db = client.db("Final_Project");
    const productsCollection = db.collection("products");
    const usersCollection = db.collection("users");
    const cartsCollection = db.collection("carts");
    const wishlistsCollection = db.collection("wishlists");
    const ordersCollection = db.collection("orders");

    // ===================== PRODUCTS ROUTES =====================

    // Get all products
    app.get("/api/products", async (req, res) => {
      try {
        const products = await productsCollection.find({}).toArray();
        res.json(products);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching products", error: error.message });
      }
    });

    // Get single product by ID
    app.get("/api/products/:id", async (req, res) => {
      try {
        const product = await productsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }
        res.json(product);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching product", error: error.message });
      }
    });

    // Create new product
    app.post("/api/products", async (req, res) => {
      try {
        const productData = {
          ...req.body,
          datePosted: new Date().toISOString(),
          rating: 0,
        };

        const result = await productsCollection.insertOne(productData);
        res.status(201).json({
          message: "Product created successfully",
          productId: result.insertedId,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error creating product", error: error.message });
      }
    });

    // Update product by ID
    app.put("/api/products/:id", async (req, res) => {
      try {
        const productId = req.params.id;
        const updateData = { ...req.body };

        // Remove fields that shouldn't be updated
        delete updateData._id;
        delete updateData.datePosted;
        delete updateData.rating;

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $set: updateData },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Product not found" });
        }

        res.json({
          message: "Product updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error updating product", error: error.message });
      }
    });

    // ===================== CATEGORIES ROUTES =====================

    // Get all categories
    app.get("/api/categories", async (req, res) => {
      try {
        const categories = [
          { id: 1, name: "Books & Notes" },
          { id: 2, name: "Electronics" },
          { id: 3, name: "Furniture" },
          { id: 4, name: "Fashion" },
          { id: 5, name: "Sports & Fitness" },
          { id: 6, name: "Vehicles" },
          { id: 7, name: "Others" },
        ];
        res.json(categories);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching categories", error: error.message });
      }
    });

    // ===================== USERS ROUTES =====================

    // Register/Create user
    app.post("/api/users/register", async (req, res) => {
      try {
        const { email, name, photoURL } = req.body;

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.json({
            message: "User already exists",
            user: existingUser,
          });
        }

        const newUser = {
          email,
          name,
          photoURL,
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({
          message: "User created successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error creating user", error: error.message });
      }
    });

    // Get user by email
    app.get("/api/users/:email", async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json(user);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching user", error: error.message });
      }
    });

    // ===================== CART ROUTES =====================

    // Get user's cart
    app.get("/api/cart/:email", async (req, res) => {
      try {
        const cart = await cartsCollection.findOne({
          userEmail: req.params.email,
        });
        res.json(cart || { userEmail: req.params.email, items: [] });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching cart", error: error.message });
      }
    });

    // Add item to cart
    app.post("/api/cart/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const { productId, quantity = 1 } = req.body;

        const product = await productsCollection.findOne({
          _id: new ObjectId(productId),
        });
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        const cart = await cartsCollection.findOne({ userEmail: email });

        if (cart) {
          const existingItem = cart.items.find(
            (item) => item.productId === productId,
          );

          if (existingItem) {
            await cartsCollection.updateOne(
              { userEmail: email, "items.productId": productId },
              { $inc: { "items.$.quantity": quantity } },
            );
          } else {
            await cartsCollection.updateOne(
              { userEmail: email },
              {
                $push: { items: { productId, quantity, addedAt: new Date() } },
              },
            );
          }
        } else {
          await cartsCollection.insertOne({
            userEmail: email,
            items: [{ productId, quantity, addedAt: new Date() }],
            createdAt: new Date(),
          });
        }

        res.json({ message: "Item added to cart successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error adding to cart", error: error.message });
      }
    });

    // Remove item from cart
    app.delete("/api/cart/:email/:productId", async (req, res) => {
      try {
        const { email, productId } = req.params;

        await cartsCollection.updateOne(
          { userEmail: email },
          { $pull: { items: { productId } } },
        );

        res.json({ message: "Item removed from cart successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error removing from cart", error: error.message });
      }
    });

    // Update cart item quantity
    app.patch("/api/cart/:email/:productId", async (req, res) => {
      try {
        const { email, productId } = req.params;
        const { quantity } = req.body;

        await cartsCollection.updateOne(
          { userEmail: email, "items.productId": productId },
          { $set: { "items.$.quantity": quantity } },
        );

        res.json({ message: "Cart updated successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error updating cart", error: error.message });
      }
    });

    // Clear cart
    app.delete("/api/cart/:email", async (req, res) => {
      try {
        await cartsCollection.updateOne(
          { userEmail: req.params.email },
          { $set: { items: [] } },
        );
        res.json({ message: "Cart cleared successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error clearing cart", error: error.message });
      }
    });

    // ===================== WISHLIST ROUTES =====================

    // Get user's wishlist
    app.get("/api/wishlist/:email", async (req, res) => {
      try {
        const wishlist = await wishlistsCollection.findOne({
          userEmail: req.params.email,
        });
        res.json(wishlist || { userEmail: req.params.email, items: [] });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching wishlist", error: error.message });
      }
    });

    // Add item to wishlist
    app.post("/api/wishlist/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const { productId } = req.body;

        const wishlist = await wishlistsCollection.findOne({
          userEmail: email,
        });

        if (wishlist) {
          const existingItem = wishlist.items.find(
            (item) => item.productId === productId,
          );
          if (!existingItem) {
            await wishlistsCollection.updateOne(
              { userEmail: email },
              { $push: { items: { productId, addedAt: new Date() } } },
            );
          }
        } else {
          await wishlistsCollection.insertOne({
            userEmail: email,
            items: [{ productId, addedAt: new Date() }],
            createdAt: new Date(),
          });
        }

        res.json({ message: "Item added to wishlist successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error adding to wishlist", error: error.message });
      }
    });

    // Remove item from wishlist
    app.delete("/api/wishlist/:email/:productId", async (req, res) => {
      try {
        const { email, productId } = req.params;

        await wishlistsCollection.updateOne(
          { userEmail: email },
          { $pull: { items: { productId: productId } } },
        );

        res.json({ message: "Item removed from wishlist successfully" });
      } catch (error) {
        res.status(500).json({
          message: "Error removing from wishlist",
          error: error.message,
        });
      }
    });

    // ===================== ORDERS ROUTES =====================

    // Get user's orders
    app.get("/api/orders/:email", async (req, res) => {
      try {
        const orders = await ordersCollection
          .find({ userEmail: req.params.email })
          .toArray();
        res.json(orders);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching orders", error: error.message });
      }
    });

    // Create order
    app.post("/api/orders", async (req, res) => {
      try {
        const { userEmail, items, total, shippingAddress, paymentMethod } =
          req.body;

        const newOrder = {
          userEmail,
          items,
          total,
          shippingAddress,
          paymentMethod,
          status: "pending",
          createdAt: new Date(),
        };

        const result = await ordersCollection.insertOne(newOrder);

        // Clear cart after order
        await cartsCollection.updateOne({ userEmail }, { $set: { items: [] } });

        res.status(201).json({
          message: "Order created successfully",
          orderId: result.insertedId,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error creating order", error: error.message });
      }
    });

    // ===================== CATEGORIES ROUTE =====================

    // Get categories with counts
    app.get("/api/categories", async (req, res) => {
      try {
        const products = await productsCollection.find({}).toArray();

        // Count products by category
        const categoryCounts = {};
        products.forEach((product) => {
          categoryCounts[product.category] =
            (categoryCounts[product.category] || 0) + 1;
        });

        // Define category details
        const categories = [
          {
            id: 1,
            name: "Books & Notes",
            icon: "📚",
            color: "blue",
            description: "Textbooks, study materials, and class notes",
          },
          {
            id: 2,
            name: "Electronics",
            icon: "💻",
            color: "purple",
            description: "Laptops, phones, calculators, and gadgets",
          },
          {
            id: 3,
            name: "Fashion",
            icon: "👕",
            color: "pink",
            description: "Clothing, shoes, and accessories",
          },
          {
            id: 4,
            name: "Furniture",
            icon: "🏠",
            color: "green",
            description: "Desks, chairs, shelves, and dorm essentials",
          },
          {
            id: 5,
            name: "Gaming",
            icon: "🎮",
            color: "red",
            description: "Gaming consoles, controllers, and accessories",
          },
          {
            id: 6,
            name: "Sports",
            icon: "🚴",
            color: "orange",
            description: "Sports equipment, bikes, and fitness gear",
          },
        ];

        // Add counts to categories
        const categoriesWithCounts = categories.map((cat) => ({
          ...cat,
          count: categoryCounts[cat.name] || 0,
        }));

        res.json(categoriesWithCounts);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching categories", error: error.message });
      }
    });

    // ===================== STATS ROUTES =====================

    // Get statistics
    app.get("/api/stats", async (req, res) => {
      try {
        const totalProducts = await productsCollection.countDocuments();
        const totalUsers = await usersCollection.countDocuments();
        const totalOrders = await ordersCollection.countDocuments();

        res.json({
          totalProducts,
          totalUsers,
          totalTransactions: totalOrders,
          activeSellers: Math.floor(totalUsers * 0.6),
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching stats", error: error.message });
      }
    });

    // ===================== ROOT ROUTE =====================

    app.get("/", (req, res) => {
      res.json({
        message: "Just-Emart Backend API is running!",
        endpoints: {
          products: "/api/products",
          cart: "/api/cart/:email",
          wishlist: "/api/wishlist/:email",
          orders: "/api/orders/:email",
          stats: "/api/stats",
        },
      });
    });
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
  }
}

run().catch(console.dir);

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
