const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

// =================Firebase Admin SDK for token verification===================
const admin = require("firebase-admin");

const serviceAccount = require("./firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ==========================================================

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

//============================== Admin Email Configuration =========================
const normalizeEmail = (email = "") => String(email).trim().toLowerCase();
const configuredAdminEmails = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean),
);

const getDefaultRoleForEmail = (email) => {
  return configuredAdminEmails.has(normalizeEmail(email)) ? "admin" : "user";
};
//================================================================================

// Middleware to verify Firebase token for protected routes
//==============================verify token middleware========================
const verifyFirebaseToken = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }
  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.token_email = normalizeEmail(userInfo.email);
    req.token_name = userInfo.name || "";
    req.token_photo = userInfo.picture || "";
    console.log("after token validation: ", userInfo);
    next();
  } catch {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid token provided" });
  }
};

const verifyTokenEmail = (emailSource = "query", emailKey = "email") => {
  return (req, res, next) => {
    const requestEmail = normalizeEmail(req[emailSource]?.[emailKey]);

    if (!requestEmail) {
      return res.status(400).send({ message: "email is required" });
    }

    if (requestEmail !== normalizeEmail(req.token_email)) {
      return res.status(403).send({ message: "forbidden access" });
    }

    next();
  };
};
//========================================================================

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
    const ratingsCollection = db.collection("ratings");

    const ensureUserRecord = async ({ email, name = "", photoURL = "" }) => {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        return null;
      }

      const defaultRole = getDefaultRoleForEmail(normalizedEmail);
      const existingUser = await usersCollection.findOne({
        email: normalizedEmail,
      });

      if (!existingUser) {
        const newUser = {
          email: normalizedEmail,
          name: name || normalizedEmail.split("@")[0],
          photoURL: photoURL || "",
          role: defaultRole,
          createdAt: new Date(),
        };
        await usersCollection.insertOne(newUser);
        return newUser;
      }

      const updateData = {};

      if (!existingUser.role) {
        updateData.role = defaultRole;
      } else if (defaultRole === "admin" && existingUser.role !== "admin") {
        updateData.role = "admin";
      }

      if (name && !existingUser.name) {
        updateData.name = name;
      }

      if (photoURL && !existingUser.photoURL) {
        updateData.photoURL = photoURL;
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updatedAt = new Date();
        await usersCollection.updateOne(
          { email: normalizedEmail },
          { $set: updateData },
        );
      }

      return {
        ...existingUser,
        ...updateData,
      };
    };

    const hasAdminAccess = async (email) => {
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail) {
        return false;
      }

      if (configuredAdminEmails.has(normalizedEmail)) {
        await usersCollection.updateOne(
          { email: normalizedEmail },
          {
            $set: {
              role: "admin",
              updatedAt: new Date(),
            },
            $setOnInsert: {
              email: normalizedEmail,
              name: normalizedEmail.split("@")[0],
              createdAt: new Date(),
            },
          },
          { upsert: true },
        );
        return true;
      }

      const userDoc = await usersCollection.findOne({ email: normalizedEmail });
      return userDoc?.role === "admin";
    };

    const verifyAdmin = async (req, res, next) => {
      try {
        const isAdmin = await hasAdminAccess(req.token_email);
        if (!isAdmin) {
          return res.status(403).json({ message: "Admin access required" });
        }

        next();
      } catch (error) {
        return res.status(500).json({
          message: "Error verifying admin access",
          error: error.message,
        });
      }
    };

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
    app.get("/api/products/:id", verifyFirebaseToken, async (req, res) => {
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
    app.post("/api/products", verifyFirebaseToken, async (req, res) => {
      try {
        const productData = {
          ...req.body,
          datePosted: new Date().toISOString(),
          rating: 0,
          totalRatings: 0,
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
    app.put("/api/products/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const productId = req.params.id;
        const updateData = { ...req.body };

        // Remove fields that shouldn't be updated
        delete updateData._id;
        delete updateData.datePosted;
        delete updateData.rating;
        delete updateData.totalRatings;

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

    // Delete product by ID (seller owner or admin)
    app.delete("/api/products/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const productId = req.params.id;

        if (!ObjectId.isValid(productId)) {
          return res.status(400).json({ message: "Invalid product id" });
        }

        const product = await productsCollection.findOne({
          _id: new ObjectId(productId),
        });

        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        const requesterEmail = normalizeEmail(req.token_email);
        const isOwner = normalizeEmail(product.sellerEmail) === requesterEmail;
        const isAdmin = await hasAdminAccess(requesterEmail);

        if (!isOwner && !isAdmin) {
          return res.status(403).json({
            message: "You are not allowed to delete this product",
          });
        }

        await productsCollection.deleteOne({ _id: new ObjectId(productId) });

        await Promise.all([
          cartsCollection.updateMany(
            {},
            { $pull: { items: { productId: String(productId) } } },
          ),
          wishlistsCollection.updateMany(
            {},
            { $pull: { items: { productId: String(productId) } } },
          ),
        ]);

        res.json({ message: "Product deleted successfully" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error deleting product", error: error.message });
      }
    });

    // ===================== ORDERS ROUTES =====================

    // Get user's orders (as buyer)
    app.get(
      "/api/orders/:email",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
        try {
          const orders = await ordersCollection
            .find({ buyerEmail: req.params.email })
            .sort({ orderDate: -1 })
            .toArray();
          res.json(orders);
        } catch (error) {
          res
            .status(500)
            .json({ message: "Error fetching orders", error: error.message });
        }
      },
    );

    // Get orders received (as seller)
    app.get(
      "/api/orders/received/:email",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
        try {
          const orders = await ordersCollection
            .find({ "items.sellerEmail": req.params.email })
            .sort({ orderDate: -1 })
            .toArray();
          res.json(orders);
        } catch (error) {
          res.status(500).json({
            message: "Error fetching received orders",
            error: error.message,
          });
        }
      },
    );

    // Create new order
    app.post(
      "/api/orders",
      verifyFirebaseToken,
      verifyTokenEmail("body", "buyerEmail"),
      async (req, res) => {
        try {
          const orderData = {
            ...req.body,
            orderDate: new Date(),
            status: "Pending",
            paymentStatus: "Pending",
          };

          // Validate stock before creating order
          if (orderData.items && orderData.items.length > 0) {
            for (const item of orderData.items) {
              const product = await productsCollection.findOne({
                _id: new ObjectId(item.productId),
              });

              if (!product) {
                return res.status(404).json({
                  message: `Product ${item.title} not found`,
                });
              }

              if (
                product.stock !== undefined &&
                product.stock < item.quantity
              ) {
                return res.status(400).json({
                  message: `Insufficient stock for ${item.title}. Available: ${product.stock}, Requested: ${item.quantity}`,
                  productId: item.productId,
                  availableStock: product.stock,
                });
              }
            }

            // Decrement stock for each product in the order
            for (const item of orderData.items) {
              await productsCollection.updateOne(
                { _id: new ObjectId(item.productId) },
                { $inc: { stock: -item.quantity } },
              );
            }
          }

          const result = await ordersCollection.insertOne(orderData);

          // Clear buyer's cart after order
          if (orderData.buyerEmail) {
            await cartsCollection.updateOne(
              { userEmail: orderData.buyerEmail },
              { $set: { items: [] } },
            );
          }

          res.status(201).json({
            message: "Order placed successfully",
            orderId: result.insertedId,
          });
        } catch (error) {
          res
            .status(500)
            .json({ message: "Error creating order", error: error.message });
        }
      },
    );

    // Update order status
    app.patch(
      "/api/orders/:id/status",
      verifyFirebaseToken,
      async (req, res) => {
        try {
          const { status, cancellationReason } = req.body;
          const orderId = req.params.id;

          if (!ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "Invalid order id" });
          }

          const allowedStatuses = [
            "Pending",
            "Processing",
            "Shipped",
            "Delivered",
            "Cancelled",
          ];

          if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
              message: "Invalid order status",
            });
          }

          // Get the current order to check its status
          const order = await ordersCollection.findOne({
            _id: new ObjectId(orderId),
          });

          if (!order) {
            return res.status(404).json({ message: "Order not found" });
          }

          const requesterEmail = normalizeEmail(req.token_email);
          const isAdmin = await hasAdminAccess(requesterEmail);
          const isOrderSeller = order.items?.some(
            (item) => normalizeEmail(item.sellerEmail) === requesterEmail,
          );

          if (!isAdmin && !isOrderSeller) {
            return res.status(403).json({
              message: "Unauthorized to update this order",
            });
          }

          // If changing status to Cancelled, restore stock
          if (status === "Cancelled" && order.status !== "Cancelled") {
            if (order.status === "Pending" || order.status === "Processing") {
              for (const item of order.items) {
                await productsCollection.updateOne(
                  { _id: new ObjectId(item.productId) },
                  { $inc: { stock: item.quantity } },
                );
              }
            }
          }

          // Prepare update object
          const updateData = { status, updatedAt: new Date() };

          // Add cancellation reason if status is Cancelled
          if (status === "Cancelled" && cancellationReason) {
            updateData.cancellationReason = cancellationReason;
            updateData.cancelledAt = new Date();
          }

          await ordersCollection.updateOne(
            { _id: new ObjectId(orderId) },
            { $set: updateData },
          );

          res.json({ message: "Order status updated successfully" });
        } catch (error) {
          res.status(500).json({
            message: "Error updating order status",
            error: error.message,
          });
        }
      },
    );

    // Cancel order
    app.patch(
      "/api/orders/:id/cancel",
      verifyFirebaseToken,
      verifyTokenEmail("body", "userEmail"),
      async (req, res) => {
        try {
          const { userEmail } = req.body;
          const normalizedUserEmail = normalizeEmail(userEmail);
          const order = await ordersCollection.findOne({
            _id: new ObjectId(req.params.id),
          });

          if (!order) {
            return res.status(404).json({ message: "Order not found" });
          }

          // Check if user is the buyer (check both buyerEmail and userEmail for compatibility)
          const orderBuyerEmail = normalizeEmail(
            order.buyerEmail || order.userEmail,
          );
          if (orderBuyerEmail !== normalizedUserEmail) {
            return res
              .status(403)
              .json({ message: "Unauthorized to cancel this order" });
          }

          // Only allow cancellation if order is not Shipped or Delivered
          if (order.status === "Shipped" || order.status === "Delivered") {
            return res.status(400).json({
              message:
                "Cannot cancel orders that have been shipped or delivered",
            });
          }

          // Restore stock for Pending or Processing orders
          if (order.status === "Pending" || order.status === "Processing") {
            for (const item of order.items) {
              await productsCollection.updateOne(
                { _id: new ObjectId(item.productId) },
                { $inc: { stock: item.quantity } },
              );
            }
          }

          await ordersCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            {
              $set: {
                status: "Cancelled",
                cancelledAt: new Date(),
                updatedAt: new Date(),
              },
            },
          );

          res.json({ message: "Order cancelled successfully" });
        } catch (error) {
          res.status(500).json({
            message: "Error cancelling order",
            error: error.message,
          });
        }
      },
    );

    // ===================== RATINGS ROUTES =====================

    // Submit a rating for a product
    app.post(
      "/api/ratings",
      verifyFirebaseToken,
      verifyTokenEmail("body", "buyerEmail"),
      async (req, res) => {
        try {
          const { productId, buyerEmail, orderId, rating, review } = req.body;

          // Validate rating
          if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
              message: "Rating must be between 1 and 5",
            });
          }

          // Check if order exists and is delivered
          const order = await ordersCollection.findOne({
            _id: new ObjectId(orderId),
          });

          if (!order) {
            return res.status(404).json({ message: "Order not found" });
          }

          if (order.buyerEmail !== buyerEmail) {
            return res
              .status(403)
              .json({ message: "Unauthorized to rate this product" });
          }

          if (order.status !== "Delivered") {
            return res.status(400).json({
              message: "You can only rate products from delivered orders",
            });
          }

          // Check if already rated
          const existingRating = await ratingsCollection.findOne({
            productId,
            buyerEmail,
            orderId,
          });

          if (existingRating) {
            // Update existing rating
            await ratingsCollection.updateOne(
              { _id: existingRating._id },
              {
                $set: {
                  rating,
                  review,
                  updatedAt: new Date(),
                },
              },
            );
          } else {
            // Create new rating
            const ratingData = {
              productId,
              buyerEmail,
              orderId,
              rating,
              review: review || "",
              createdAt: new Date(),
            };
            await ratingsCollection.insertOne(ratingData);
          }

          // Calculate and update average rating for the product
          const allRatings = await ratingsCollection
            .find({ productId })
            .toArray();
          const averageRating =
            allRatings.reduce((sum, r) => sum + r.rating, 0) /
            allRatings.length;
          const roundedRating = Math.round(averageRating * 10) / 10;

          console.log(
            `Updating product ${productId} with rating: ${roundedRating}, total: ${allRatings.length}`,
          );

          await productsCollection.updateOne(
            { _id: new ObjectId(productId) },
            {
              $set: {
                rating: roundedRating,
                totalRatings: allRatings.length,
              },
            },
          );

          res.json({
            message: existingRating
              ? "Rating updated successfully"
              : "Rating submitted successfully",
            averageRating: roundedRating,
            totalRatings: allRatings.length,
          });
        } catch (error) {
          res.status(500).json({
            message: "Error submitting rating",
            error: error.message,
          });
        }
      },
    );

    // Get ratings for a product
    app.get("/api/ratings/:productId", async (req, res) => {
      try {
        const ratings = await ratingsCollection
          .find({ productId: req.params.productId })
          .sort({ createdAt: -1 })
          .toArray();
        res.json(ratings);
      } catch (error) {
        res.status(500).json({
          message: "Error fetching ratings",
          error: error.message,
        });
      }
    });

    // Check if user has rated a product from a specific order
    app.get("/api/ratings/check/:orderId/:productId", async (req, res) => {
      try {
        const { orderId, productId } = req.params;
        const { buyerEmail } = req.query;

        const rating = await ratingsCollection.findOne({
          orderId,
          productId,
          buyerEmail,
        });

        res.json({ hasRated: !!rating, rating: rating || null });
      } catch (error) {
        res.status(500).json({
          message: "Error checking rating",
          error: error.message,
        });
      }
    });

    // ===================== CATEGORIES ROUTES =====================

    // Get all categories
    app.get("/api/categories", async (req, res) => {
      try {
        const categoryNames = [
          "Books & Notes",
          "Electronics",
          "Furniture",
          "Fashion",
          "Sports & Fitness",
          "Vehicles",
          "Others",
        ];

        // Get product count for each category
        const categoriesWithCount = await Promise.all(
          categoryNames.map(async (name, index) => {
            const count = await productsCollection.countDocuments({
              category: name,
            });
            return { id: index + 1, name, count };
          }),
        );

        res.json(categoriesWithCount);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching categories", error: error.message });
      }
    });

    // ===================== USERS ROUTES =====================

    // Register/Create user
    app.post(
      "/api/users/register",
      verifyFirebaseToken,
      verifyTokenEmail("body"),
      async (req, res) => {
        try {
          const { email, name, photoURL } = req.body;
          const normalizedEmail = normalizeEmail(email);

          if (!normalizedEmail) {
            return res.status(400).json({ message: "Email is required" });
          }

          const existingUser = await usersCollection.findOne({
            email: normalizedEmail,
          });
          const userRecord = await ensureUserRecord({
            email: normalizedEmail,
            name,
            photoURL,
          });

          res.status(existingUser ? 200 : 201).json({
            message: existingUser
              ? "User already exists"
              : "User created successfully",
            user: userRecord,
          });
        } catch (error) {
          res
            .status(500)
            .json({ message: "Error creating user", error: error.message });
        }
      },
    );

    // Get authenticated user's role
    app.get(
      "/api/users/:email/role",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
        try {
          const email = normalizeEmail(req.params.email);
          const userRecord = await ensureUserRecord({
            email,
            name: req.token_name,
            photoURL: req.token_photo,
          });

          res.json({
            email,
            role: userRecord?.role || getDefaultRoleForEmail(email),
            name: userRecord?.name || req.token_name || "",
          });
        } catch (error) {
          res.status(500).json({
            message: "Error fetching user role",
            error: error.message,
          });
        }
      },
    );

    // Get user by email
    app.get("/api/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        const user = await usersCollection.findOne({ email });
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

    // ===================== PROFILE ROUTES =====================

    // Get user profile
    app.get(
      "/api/users/:email/profile",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
        try {
          const email = normalizeEmail(req.params.email);
          let user = await usersCollection.findOne({ email });

          // If user doesn't exist, create them with default profile
          if (!user) {
            const newUser = {
              email,
              name: req.token_name || email.split("@")[0],
              photoURL: req.token_photo || "",
              role: getDefaultRoleForEmail(email),
              profile: {
                buyingContactNumber: "",
                sellingContactNumber: "",
                address: {
                  locationType: "Inside Campus",
                  customAddress: "",
                },
              },
              createdAt: new Date(),
            };
            await usersCollection.insertOne(newUser);
            user = newUser;
          }

          res.json({
            profile: user.profile || {
              buyingContactNumber: "",
              sellingContactNumber: "",
              address: {
                locationType: "Inside Campus",
                customAddress: "",
              },
            },
          });
        } catch (error) {
          res
            .status(500)
            .json({ message: "Error fetching profile", error: error.message });
        }
      },
    );

    // Update user profile
    app.put(
      "/api/users/:email/profile",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
        try {
          const { profile } = req.body;
          const email = normalizeEmail(req.params.email);

          await usersCollection.updateOne(
            { email },
            {
              $set: {
                profile: {
                  buyingContactNumber: profile.buyingContactNumber || "",
                  sellingContactNumber: profile.sellingContactNumber || "",
                  address: {
                    locationType:
                      profile.address?.locationType || "Inside Campus",
                    customAddress: profile.address?.customAddress || "",
                  },
                },
                updatedAt: new Date(),
              },
              $setOnInsert: {
                email,
                role: getDefaultRoleForEmail(email),
                name: req.token_name || email.split("@")[0],
                photoURL: req.token_photo || "",
                createdAt: new Date(),
              },
            },
            { upsert: true },
          );

          res.json({ message: "Profile updated successfully" });
        } catch (error) {
          res
            .status(500)
            .json({ message: "Error updating profile", error: error.message });
        }
      },
    );

    // ===================== CART ROUTES =====================

    // Get user's cart
    app.get(
      "/api/cart/:email",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
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
      },
    );

    // Add item to cart
    app.post(
      "/api/cart/:email",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
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
                  $push: {
                    items: { productId, quantity, addedAt: new Date() },
                  },
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
      },
    );

    // Remove item from cart
    app.delete(
      "/api/cart/:email/:productId",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
        try {
          const { email, productId } = req.params;

          await cartsCollection.updateOne(
            { userEmail: email },
            { $pull: { items: { productId } } },
          );

          res.json({ message: "Item removed from cart successfully" });
        } catch (error) {
          res.status(500).json({
            message: "Error removing from cart",
            error: error.message,
          });
        }
      },
    );

    // Update cart item quantity
    app.patch(
      "/api/cart/:email/:productId",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
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
      },
    );

    // Clear cart
    app.delete(
      "/api/cart/:email",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
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
      },
    );

    // ===================== WISHLIST ROUTES =====================

    // Get user's wishlist
    app.get(
      "/api/wishlist/:email",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
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
      },
    );

    // Add item to wishlist
    app.post(
      "/api/wishlist/:email",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
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
          res.status(500).json({
            message: "Error adding to wishlist",
            error: error.message,
          });
        }
      },
    );

    // Remove item from wishlist
    app.delete(
      "/api/wishlist/:email/:productId",
      verifyFirebaseToken,
      verifyTokenEmail("params"),
      async (req, res) => {
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
      },
    );

    // ===================== ADMIN ROUTES =====================

    // Admin dashboard stats
    app.get(
      "/api/admin/stats",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const [totalProducts, totalUsers, totalOrders, totalAdmins] =
            await Promise.all([
              productsCollection.countDocuments(),
              usersCollection.countDocuments(),
              ordersCollection.countDocuments(),
              usersCollection.countDocuments({ role: "admin" }),
            ]);

          const pendingOrders = await ordersCollection.countDocuments({
            status: "Pending",
          });

          res.json({
            totalProducts,
            totalUsers,
            totalOrders,
            totalAdmins,
            pendingOrders,
          });
        } catch (error) {
          res.status(500).json({
            message: "Error fetching admin stats",
            error: error.message,
          });
        }
      },
    );

    // Admin - get all users
    app.get(
      "/api/admin/users",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const users = await usersCollection
            .find(
              {},
              {
                projection: {
                  password: 0,
                },
              },
            )
            .sort({ createdAt: -1 })
            .toArray();

          res.json(users);
        } catch (error) {
          res.status(500).json({
            message: "Error fetching users",
            error: error.message,
          });
        }
      },
    );

    // Admin - update user role
    app.patch(
      "/api/admin/users/:id/role",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { role } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user id" });
          }

          if (!["user", "admin"].includes(role)) {
            return res.status(400).json({
              message: "Invalid role. Allowed values: user, admin",
            });
          }

          const targetUser = await usersCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
          }

          if (
            normalizeEmail(targetUser.email) === normalizeEmail(req.token_email)
          ) {
            return res.status(400).json({
              message: "You cannot change your own role",
            });
          }

          await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                role,
                updatedAt: new Date(),
              },
            },
          );

          res.json({ message: "User role updated successfully" });
        } catch (error) {
          res.status(500).json({
            message: "Error updating user role",
            error: error.message,
          });
        }
      },
    );

    // Admin - get all products
    app.get(
      "/api/admin/products",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const products = await productsCollection
            .find({})
            .sort({ datePosted: -1 })
            .toArray();
          res.json(products);
        } catch (error) {
          res.status(500).json({
            message: "Error fetching products",
            error: error.message,
          });
        }
      },
    );

    // Admin - get all orders
    app.get(
      "/api/admin/orders",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const orders = await ordersCollection
            .find({})
            .sort({ orderDate: -1 })
            .toArray();

          res.json(orders);
        } catch (error) {
          res.status(500).json({
            message: "Error fetching orders",
            error: error.message,
          });
        }
      },
    );

    // Admin - update any order status
    app.patch(
      "/api/admin/orders/:id/status",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status, cancellationReason } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid order id" });
          }

          const allowedStatuses = [
            "Pending",
            "Processing",
            "Shipped",
            "Delivered",
            "Cancelled",
          ];

          if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid order status" });
          }

          const order = await ordersCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!order) {
            return res.status(404).json({ message: "Order not found" });
          }

          if (status === "Cancelled" && order.status !== "Cancelled") {
            if (order.status === "Pending" || order.status === "Processing") {
              for (const item of order.items) {
                await productsCollection.updateOne(
                  { _id: new ObjectId(item.productId) },
                  { $inc: { stock: item.quantity } },
                );
              }
            }
          }

          const updateData = {
            status,
            updatedAt: new Date(),
          };

          if (status === "Cancelled") {
            updateData.cancelledAt = new Date();
            if (cancellationReason) {
              updateData.cancellationReason = cancellationReason;
            }
          }

          await ordersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData },
          );

          res.json({ message: "Order status updated successfully" });
        } catch (error) {
          res.status(500).json({
            message: "Error updating order status",
            error: error.message,
          });
        }
      },
    );

    // Admin - delete any product
    app.delete(
      "/api/admin/products/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product id" });
          }

          const product = await productsCollection.findOne({
            _id: new ObjectId(id),
          });
          if (!product) {
            return res.status(404).json({ message: "Product not found" });
          }

          await productsCollection.deleteOne({ _id: new ObjectId(id) });
          await Promise.all([
            cartsCollection.updateMany(
              {},
              { $pull: { items: { productId: String(id) } } },
            ),
            wishlistsCollection.updateMany(
              {},
              { $pull: { items: { productId: String(id) } } },
            ),
          ]);

          res.json({ message: "Product deleted successfully" });
        } catch (error) {
          res.status(500).json({
            message: "Error deleting product",
            error: error.message,
          });
        }
      },
    );

    // ===================== STATS ROUTES =====================

    // Get statistics
    app.get("/api/stats", verifyFirebaseToken, async (req, res) => {
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
