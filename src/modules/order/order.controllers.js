import axios from "axios";
import mongoose from "mongoose";

import Cart from "../../../database/models/cart.model.js";
import Order from "../../../database/models/order.model.js";
import { messages } from "../../utils/constant/messages.js";
import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import Coupon from "../../../database/models/coupon.model.js";
import {
  couponTypes,
  orderStatus,
  payments,
} from "../../utils/constant/enums.js";
import Product from "../../../database/models/product.model.js";
import { Parser } from "json2csv";
import PDFDocument from "pdfkit";
import Stripe from "stripe";
import notificationModel from "../../../database/models/notification.model.js";

const stripe = new Stripe(process.env.APIKEYORDER, {
  apiVersion: "2023-10-16",
});

export const createOrder = catchAsyncError(async (req, res, next) => {
  const { fullName, address, phone, couponCode, notes, payment } = req.body;
  const userId = req.authUser._id;

  // Debug: Log received payment method
  console.log("📦 createOrder called - Payment method:", payment);

  const cart = await Cart.findOne({ user: userId }).populate(
    "products.productId"
  );
  if (!cart || !cart.products.length)
    return next(new AppError(messages.cart.empty, 404));

  let orderProducts = [];
  let orderPrice = 0;

  for (const item of cart.products) {
    const product = item.productId;

    if (!product.instock(item.quantity))
      return next(new AppError(messages.product.outStock, 400));

    const productFinal = product.finalPrice * item.quantity;

    orderProducts.push({
      productId: product._id,
      imageCover: product.imageCover,
      title: product.title,
      price: product.price,
      quantity: item.quantity,
      discount: product.discount,
      finalPrice: productFinal,
    });

    orderPrice += productFinal;
  }

  let finalPrice = orderPrice;
  let appliedCoupon = null;

  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode });
    if (!coupon) return next(new AppError(messages.coupon.notFound, 404));

    const now = Date.now();
    if (coupon.fromDate > now)
      return next(new AppError("Coupon has not started yet", 400));
    if (coupon.expire < now)
      return next(new AppError("Coupon has expired", 400));

    // ========= Check usage coupon limit ==========
    const userUsage = coupon.usedBy.find(
      (u) => u.user.toString() === userId.toString()
    );
    if (userUsage && userUsage.count >= (coupon.maxUsage || 1)) {
      return next(
        new AppError("You have reached the usage limit for this coupon", 400)
      );
    }
    // ========= ===================== ==========

    appliedCoupon = coupon._id;

    if (coupon.type === couponTypes.PERCENTAGE) {
      finalPrice = orderPrice - (orderPrice * coupon.discount) / 100;
    } else if (coupon.type === couponTypes.FIXED_AMOUNT) {
      finalPrice = Math.max(0, orderPrice - coupon.discount);
    }
  }

  // ================= VISA PAYMENT: Create checkout session FIRST =================
  // Check for visa payment (case-insensitive comparison)
  const isVisaPayment = payment && payment.toLowerCase() === "visa";

  if (isVisaPayment) {
    // Calculate coupon discount ratio to apply to each product
    const discountRatio = appliedCoupon ? finalPrice / orderPrice : 1;
    const couponSavings = appliedCoupon ? orderPrice - finalPrice : 0;

    // Create line items with all product details and images
    const lineItems = orderProducts.map((product) => {
      // Extract image URL from imageCover
      let imageUrl = null;
      if (product.imageCover) {
        if (typeof product.imageCover === "string") {
          imageUrl = product.imageCover;
        } else if (product.imageCover.secure_url) {
          imageUrl = product.imageCover.secure_url;
        }
      }

      const productDiscount = product.discount || 0;
      const originalTotal = product.price * product.quantity;
      const savedFromProductDiscount = originalTotal - product.finalPrice;

      // Apply coupon discount ratio to product price
      const priceAfterCoupon = product.finalPrice * discountRatio;

      // Build detailed description
      let description = `Qty: ${product.quantity} × ${product.price} EGP`;
      if (productDiscount > 0) {
        description += ` | Product Discount: ${productDiscount}% (-${savedFromProductDiscount.toFixed(
          0
        )} EGP)`;
      }
      if (appliedCoupon && discountRatio < 1) {
        const couponSaveOnItem = product.finalPrice - priceAfterCoupon;
        description += ` | Coupon: -${couponSaveOnItem.toFixed(0)} EGP`;
      }

      return {
        price_data: {
          currency: "egp",
          product_data: {
            name: product.title,
            description: description,
            images: imageUrl ? [imageUrl] : [],
          },
          unit_amount: Math.round(priceAfterCoupon * 100),
        },
        quantity: 1,
      };
    });

    // Prepare minimal order products for metadata (Stripe has 500 char limit per value)
    // Store only productId and quantity - fetch full details in webhook
    const orderProductsForMetadata = orderProducts.map((p) => ({
      p: p.productId.toString(), // productId
      q: p.quantity, // quantity
    }));

    // NO ORDER CREATED HERE - Order will be created in webhook after payment success

    // Create Stripe checkout session with all order data in metadata
    const successUrl =
      process.env.SUCCESS_URL || "http://localhost:5173/order-success";
    const successUrlWithSession = successUrl.includes("?")
      ? `${successUrl}&session_id={CHECKOUT_SESSION_ID}`
      : `${successUrl}?session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl = process.env.CANCEL_URL || "http://localhost:5173/cart";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      success_url: successUrlWithSession,
      cancel_url: cancelUrl,
      customer_email: req.authUser.email,
      line_items: lineItems,
      metadata: {
        userId: userId.toString(),
        fullName: fullName || "",
        address: address || "",
        phone: phone || "",
        notes: notes || "",
        couponId: appliedCoupon ? appliedCoupon.toString() : "",
        orderPrice: orderPrice.toString(),
        finalPrice: finalPrice.toString(),
        orderProducts: JSON.stringify(orderProductsForMetadata),
      },
    });
    await notificationModel.create({
      user: userId,
      type: "PAYMENT",
      title: "Payment Started",
      message: "You started checkout. Complete payment to place your order.",
      data: {
        paymentMethod: "visa",
        amount: finalPrice,
      },
    });

    // Return checkout URL - NO order created yet
    return res.status(200).json({
      success: true,
      message: "Checkout session created. Complete payment to place order.",
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  }

  // ================= CASH PAYMENT: Create order immediately =================
  const order = await Order.create({
    fullName,
    user: userId,
    products: orderProducts,
    address,
    phone,
    orderPrice,
    finalPrice,
    notes,
    payment,
    coupon: appliedCoupon,
    status: orderStatus.PLACED,
  });
  await notificationModel.create({
    user: userId,
    type: "ORDER",
    title: "Order Placed",
    message: `Your order has been placed successfully.`,
    data: { orderId: order._id, status: order.status },
  });
  // decrease stock
  for (const item of orderProducts) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { stock: -item.quantity },
    });
  }

  await Cart.findOneAndUpdate(
    { user: userId },
    { products: [], totalPrice: 0 }
  );

  res.status(201).json({
    success: true,
    message: messages.order.createdSuccessfully,
    data: order,
  });

  // ============= Update coupon usage =============
  if (appliedCoupon) {
    const coupon = await Coupon.findById(appliedCoupon);
    if (coupon) {
      const userUsageIndex = coupon.usedBy.findIndex(
        (u) => u.user.toString() === userId.toString()
      );
      if (userUsageIndex > -1) {
        coupon.usedBy[userUsageIndex].count += 1;
      } else {
        coupon.usedBy.push({ user: userId, count: 1 });
      }
      await coupon.save();
    }
  }
  // ========= ========================= ==========
});

export const createOrderWithoutstripe = catchAsyncError(
  async (req, res, next) => {
    const { fullName, address, phone, couponCode, notes } = req.body;
    const userId = req.authUser._id;
    let cart = await Cart.findOne({ user: userId }).populate(
      "products.productId"
    );
    if (!cart) {
      cart = await Cart.create({ user: userId, products: [], totalPrice: 0 });
    }

    if (!cart.products.length)
      return next(new AppError(messages.cart.empty, 404));

    let orderProducts = [];
    let orderPrice = 0;

    for (const item of cart.products) {
      const product = item.productId;

      if (!product.instock(item.quantity))
        return next(new AppError(messages.product.outStock, 400));

      const productFinal = product.finalPrice * item.quantity;

      orderProducts.push({
        productId: product._id,
        imageCover: product.imageCover,
        title: product.title,
        price: product.price,
        quantity: item.quantity,
        discount: product.discount,
        finalPrice: productFinal,
      });

      orderPrice += productFinal;
    }

    let finalPrice = orderPrice;
    let appliedCoupon = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });
      if (!coupon) return next(new AppError(messages.coupon.notFound, 404));

      const now = Date.now();
      if (coupon.fromDate > now)
        return next(new AppError("Coupon has not started yet", 400));
      if (coupon.expire < now)
        return next(new AppError("Coupon has expired", 400));

      // ============ Check usage limit ==================
      const userUsage = coupon.usedBy.find(
        (u) => u.user.toString() === userId.toString()
      );
      if (userUsage && userUsage.count >= (coupon.maxUsage || 1)) {
        return next(
          new AppError("You have reached the usage limit for this coupon", 400)
        );
      }
      // =========== ================== ===================
      appliedCoupon = coupon._id;

      if (coupon.type === couponTypes.PERCENTAGE) {
        finalPrice = orderPrice - (orderPrice * coupon.discount) / 100;
      } else if (coupon.type === couponTypes.FIXED_AMOUNT) {
        finalPrice = Math.max(0, orderPrice - coupon.discount);
      }
    }

    const order = await Order.create({
      fullName,
      user: userId,
      products: orderProducts,
      address,
      phone,
      orderPrice,
      finalPrice,
      notes,
      coupon: appliedCoupon,
    });
    await notificationModel.create({
      user: userId,
      type: "ORDER",
      title: "Order Placed",
      message: `Your order has been placed successfully.`,
      data: { orderId: order._id, status: order.status },
    });

    for (const item of orderProducts) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { products: [], totalPrice: 0 } },
      { new: true }
    );

    res.status(201).json({
      message: messages.order.createdSuccessfully,
      success: true,
      data: order,
    });

    // ============== Update coupon usage ==================
    if (appliedCoupon) {
      const coupon = await Coupon.findById(appliedCoupon);
      if (coupon) {
        const userUsageIndex = coupon.usedBy.findIndex(
          (u) => u.user.toString() === userId.toString()
        );
        if (userUsageIndex > -1) {
          coupon.usedBy[userUsageIndex].count += 1;
        } else {
          coupon.usedBy.push({ user: userId, count: 1 });
        }
        await coupon.save();
      }
    }
    // ============= ===================== ===================
  }
);

export const getUserOrders = catchAsyncError(async (req, res, next) => {
  const userId = req.authUser._id;
  const orders = await Order.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate("products.productId");

  return res.status(200).json({
    message: messages.SUCCESS,
    results: orders.length,
    data: orders,
  });
});

// Get order by Stripe session ID (for frontend after payment redirect)
export const getOrderBySessionId = catchAsyncError(async (req, res, next) => {
  const { sessionId } = req.params;

  // Try to find order by stripeSessionId
  let order = await Order.findOne({ stripeSessionId: sessionId }).populate(
    "products.productId"
  );

  // If not found, webhook might not have processed yet - wait and retry
  if (!order) {
    // Wait 2 seconds and try again (webhook may be processing)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    order = await Order.findOne({ stripeSessionId: sessionId }).populate(
      "products.productId"
    );
  }

  if (!order) {
    return next(
      new AppError(
        "Order not found. Payment may still be processing. Please check your orders in a moment.",
        404
      )
    );
  }

  return res.status(200).json({
    success: true,
    message: "Order retrieved successfully",
    data: order,
  });
});

// Verify payment with Stripe and create order (alternative to webhook)
export const verifyPaymentAndCreateOrder = catchAsyncError(
  async (req, res, next) => {
    const { sessionId } = req.params;

    // Check if order already exists for this session (prevent duplicates)
    const existingOrder = await Order.findOne({ stripeSessionId: sessionId });
    if (existingOrder) {
      return res.status(200).json({
        success: true,
        message: "Order already exists",
        data: existingOrder,
      });
    }

    // Retrieve the session from Stripe to verify payment
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return next(new AppError("Invalid session ID", 400));
    }

    // Check if payment was successful
    if (session.payment_status !== "paid") {
      return next(new AppError("Payment not completed", 400));
    }

    const metadata = session.metadata;

    if (!metadata || !metadata.orderProducts) {
      return next(new AppError("Invalid session metadata", 400));
    }

    // Parse minimal product data from metadata
    const minimalProducts = JSON.parse(metadata.orderProducts);

    // Fetch full product details from database
    const orderProducts = [];
    for (const item of minimalProducts) {
      const product = await Product.findById(item.p);
      if (product) {
        orderProducts.push({
          productId: product._id,
          title: product.title,
          quantity: item.q,
          imageCover: product.imageCover,
          price: product.price,
          discount: product.discount || 0,
          finalPrice: product.priceAfterDiscount || product.price,
        });
      }
    }

    // Create the order
    const order = await Order.create({
      fullName: metadata.fullName,
      user: metadata.userId,
      products: orderProducts,
      address: metadata.address || null,
      phone: metadata.phone,
      orderPrice: parseFloat(metadata.orderPrice),
      finalPrice: parseFloat(metadata.finalPrice),
      notes: metadata.notes || null,
      payment: payments.VISA,
      coupon: metadata.couponId || null,
      status: orderStatus.PLACED,
      isPaid: true,
      paidAt: new Date(),
      stripeSessionId: sessionId,
    });

    // Decrease stock for each product
    for (const item of minimalProducts) {
      await Product.findByIdAndUpdate(item.p, {
        $inc: { stock: -item.q },
      });
    }

    // Clear the user's cart
    await Cart.findOneAndUpdate(
      { user: metadata.userId },
      { products: [], totalPrice: 0 }
    );

    console.log(`✅ Order created after payment verification: ${order._id}`);
    await notificationModel.create({
      user: metadata.userId,
      type: "ORDER",
      title: "Order Placed",
      message: "Your order has been placed successfully.",
      data: {
        orderId: order._id,
        status: order.status,
      },
    });
    return res.status(201).json({
      success: true,
      message: "Payment verified and order created successfully",
      data: order,
    });
  }
);

export const getOrderDetails = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findOne({
    _id: id,
  }).populate("products.productId");

  if (!order) return next(new AppError(messages.order.notFound, 404));

  return res.status(200).json({
    message: messages.SUCCESS,
    data: order,
  });
});

export const updateOrderStatus = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = Object.values(orderStatus);
  if (!validStatuses.includes(status))
    return next(new AppError("Invalid order status", 400));

  const order = await Order.findById(id).populate("products.productId");
  if (!order) return next(new AppError(messages.order.notFound, 404));

  // If order is already cancelled, prevent double-restock
  if (
    order.status === orderStatus.CANCELED &&
    status === orderStatus.CANCELED
  ) {
    return next(new AppError("Order is already cancelled", 400));
  }

  // If changing status to cancelled restore stock quantities
  if (status === orderStatus.CANCELED) {
    for (const item of order.products) {
      if (item.productId) {
        await Product.findByIdAndUpdate(item.productId._id, {
          $inc: { stock: item.quantity },
        });
      }
    }
  }

  order.status = status;
  await order.save();
  await notificationModel.create({
    user: order.user,
    type: "ORDER",
    title: "Order Status Updated",
    message: `Your order is now ${status}`,
    data: { orderId: order._id, status },
  });

  return res.status(200).json({
    message: "Order status updated successfully",
    data: order,
  });
});

export const softDeleteOrder = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findOneAndUpdate(
    { _id: id },
    { isDeleted: true },
    { new: true }
  );

  if (!order) return next(new AppError(messages.order.notFound, 404));

  return res.status(200).json({
    message: "Order soft deleted successfully",
    data: order,
  });
});

export const hardDeleteOrder = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findOneAndDelete({
    _id: id,
  });
  if (!order) return next(new AppError(messages.order.notFound, 404));

  return res.status(200).json({
    message: "Order permanently deleted",
  });
});

export const createOrderWithLocation = catchAsyncError(
  async (req, res, next) => {
    const { address, phone, location, fullName } = req.body;

    const user = req.authUser;
    console.log("🧭 Authenticated user ID:", req.authUser._id);

    if (!user) return next(new AppError(messages.auth.userNotFound, 401));

    const email = user.email;

    if (!phone) return next(new AppError("Phone number is required", 400));
    if (!fullName) return next(new AppError("Full name is required", 400));

    if (!address && !location)
      return next(
        new AppError(
          "Please provide either a written address or a current location",
          400
        )
      );

    if (location && (!location.latitude || !location.longitude)) {
      return next(new AppError("Latitude and longitude are required", 400));
    }

    const cart = await Cart.findOne({ user: user._id }).populate({
      path: "products.productId",
      options: { lean: false },
    });

    if (!cart) return next(new AppError(messages.cart.notFound, 404));
    if (!cart.products.length)
      return next(new AppError(messages.cart.empty, 400));

    const orderProducts = [];
    let orderPrice = 0;

    for (const item of cart.products) {
      const product = item.productId;

      if (!product) {
        return next(
          new AppError("A product in your cart no longer exists", 400)
        );
      }

      if (product.stock < item.quantity) {
        return next(new AppError(`${product.title} is out of stock`, 400));
      }

      const finalPrice = product.finalPrice * item.quantity;

      orderProducts.push({
        productId: product._id,
        title: product.title,
        price: product.price,
        quantity: item.quantity,
        discount: product.discount,
        finalPrice,
      });

      orderPrice += finalPrice;

      product.stock -= item.quantity;
      await product.save();
    }

    const finalPrice = orderPrice;

    let locationData = null;
    if (location) {
      let description = location.description;

      if (!description && process.env.GOOGLE_MAPS_API_KEY) {
        try {
          const { data } = await axios.get(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.latitude},${location.longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`
          );
          description =
            data.results[0]?.formatted_address || "Unknown location";
        } catch (err) {
          console.error("Google Maps API Error:", err.message);
        }
      }

      locationData = {
        latitude: location.latitude,
        longitude: location.longitude,
        description,
      };
    }

    const order = await Order.create({
      user: user._id,
      userName: fullName,
      email,
      products: orderProducts,
      address: address || null,
      location: locationData || null,
      phone,
      orderPrice,
      finalPrice,
    });

    await Cart.findOneAndDelete({ user: user._id });

    res.status(201).json({
      success: true,
      message: messages.order.createdSuccessfully,
      data: order,
    });
  }
);

export const getAllOrders = catchAsyncError(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const filter = { isDeleted: { $ne: true } };

  const ordersQuery = Order.find(filter)
    .populate("user", "firstName lastName email")
    .populate("products.productId", "title price finalPrice")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const [orders, totalOrders] = await Promise.all([
    ordersQuery,
    Order.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalOrders / limit);

  res.status(200).json({
    success: true,
    message: messages.SUCCESS,
    pagination: {
      currentPage: page,
      totalPages,
      totalOrders,
    },
    data: orders,
  });
});

export const updateOrder = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { fullName, phone, address, status, finalPrice, notes } = req.body;

  if (
    !fullName &&
    !phone &&
    !address &&
    !status &&
    !notes &&
    finalPrice === undefined
  ) {
    return next(
      new AppError("Please provide at least one field to update", 400)
    );
  }

  if (finalPrice !== undefined && (isNaN(finalPrice) || finalPrice < 0)) {
    return next(
      new AppError("Final price must be a valid positive number", 400)
    );
  }

  const order = await Order.findById(id).populate("products.productId");
  if (!order) {
    return next(new AppError(messages.order.notFound, 404));
  }

  if (
    status &&
    status === orderStatus.CANCELED &&
    order.status !== orderStatus.CANCELED
  ) {
    for (const item of order.products) {
      if (item.productId) {
        await Product.findByIdAndUpdate(item.productId._id, {
          $inc: { stock: item.quantity },
        });
      }
    }
  }

  // Apply updates
  if (fullName) order.fullName = fullName;
  if (phone) order.phone = phone;
  if (address) order.address = address;
  if (status) order.status = status;
  if (notes) order.notes = notes;
  if (finalPrice !== undefined) order.finalPrice = finalPrice;

  await order.save();

  // repopulate for consistent response
  const updatedOrder = await Order.findById(order._id).populate(
    "products.productId",
    "title price finalPrice"
  );

  return res.status(200).json({
    success: true,
    message: "Order updated successfully",
    data: updatedOrder,
  });
});

export const getUserOrderCounts = catchAsyncError(async (req, res, next) => {
  const counts = await Order.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: "$user", totalOrders: { $sum: 1 } } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        userId: "$user._id",
        userName: "$user.userName",
        email: "$user.email",
        image: "$user.image",
        mobileNumber: "$user.mobileNumber",
        role: "$user.role",
        totalOrders: 1,
      },
    },
  ]);

  res.status(200).json({
    success: true,
    message: "User order counts fetched successfully",
    data: counts,
  });
});

// ==> analysis and reports
export const getRevenuePerMonth = catchAsyncError(async (req, res, next) => {
  const revenue = await Order.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        totalRevenue: { $sum: "$finalPrice" },
        totalOrders: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  res.status(200).json({
    success: true,
    message: "Monthly revenue fetched successfully",
    data: revenue,
  });
});

// ==> export orders to CSV
export const exportOrdersToCSV = catchAsyncError(async (req, res, next) => {
  const orders = await Order.find({ isDeleted: { $ne: true } })
    .populate("user", "firstName lastName email")
    .populate("products.productId", "title price");

  const csvData = orders.map((order) => ({
    OrderID: order._id,
    Customer: `${order.fullName}`,
    TotalPrice: order.finalPrice,
    Status: order.status,
    Date: order.createdAt.toISOString(),
  }));

  const parser = new Parser();
  const csv = parser.parse(csvData);

  res.header("Content-Type", "text/csv");
  res.attachment("orders-report.csv");
  res.send(csv);
});

// ==> export orders to PDF
export const exportOrdersToPDF = catchAsyncError(async (req, res, next) => {
  const orders = await Order.find({ isDeleted: { $ne: true } })
    .populate("user", "firstName lastName email")
    .populate("products.productId", "title price");

  const doc = new PDFDocument({ margin: 30 });
  const filename = `orders-report-${Date.now()}.pdf`;

  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res);

  doc.fontSize(18).text("Orders Report", { align: "center" });
  doc.moveDown();

  orders.forEach((order, i) => {
    doc.fontSize(12).text(`Order #${i + 1}`);
    doc.text(`Customer: ${order.fullName}`);
    doc.text(`Total: $${order.finalPrice}`);
    doc.text(`Status: ${order.status}`);
    doc.text(`Date: ${order.createdAt.toLocaleString()}`);
    doc.moveDown();
  });

  doc.end();
});

export const getOrdersDistributionByStatus = catchAsyncError(
  async (req, res, next) => {
    const distribution = await Order.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const formatted = distribution.map((d) => ({
      status: d._id || "Unknown",
      count: d.count,
    }));

    res.status(200).json({
      success: true,
      message: "Orders distribution by status fetched successfully",
      data: formatted,
    });
  }
);

export const createCheckoutSession = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  // ==> from order
  let cart = await Cart.findById(id);
  if (!cart) return next(new AppError(messages.cart.notFound, 404));
  let totalCartPrice = cart.totalPrice;
  // // ==> from order
  let order = await Order.findById(id);
  if (!order) return next(new AppError(messages.order.notFound, 404));
  let totalOrderPrice = order.finalPrice;
  let session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: "egp",
          unit_amount: totalCartPrice * 100,
          product_data: {
            name: req.authUser.email,
          },
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: "http://localhost:5173/profile",
    cancel_url: "http://localhost:5173/cart",
    customer_email: req.authUser.email,
    client_reference_id: req.params.id, // ==> cart id
    metadata: req.body.shippingAddress,
  });

  res.status(200).json({ message: "success", data: session });
});

export const getSoftDeletedOrders = catchAsyncError(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const filter = { isDeleted: true };

  const ordersQuery = Order.find(filter)
    .populate("user", "firstName lastName email")
    .populate("products.productId", "title price finalPrice")
    .sort({ deletedAt: -1 })
    .skip(skip)
    .limit(limit);

  const [orders, totalOrders] = await Promise.all([
    ordersQuery,
    Order.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalOrders / limit);

  res.status(200).json({
    success: true,
    message: "Soft deleted orders fetched successfully",
    pagination: {
      currentPage: page,
      totalPages,
      totalOrders,
    },
    data: orders,
  });
});

export const restoreOrder = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findById(id);
  if (!order) return next(new AppError(messages.order.notFound, 404));

  if (!order.isDeleted) return next(new AppError("Order is not deleted", 400));

  order.isDeleted = false;
  order.deletedAt = undefined;

  await order.save();

  await notificationModel.create({
    user: order.user,
    type: "ORDER",
    title: "Order Restored",
    message: "Your order has been restored successfully.",
    data: { orderId: order._id },
  });

  res.status(200).json({
    success: true,
    message: "Order restored successfully",
    data: order,
  });
});
