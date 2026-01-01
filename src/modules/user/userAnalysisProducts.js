import Order from "../../../database/models/order.model.js";
import { catchAsyncError } from "../../utils/catch-error.js";

export const getUserSpendingSummary = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;

  const summary = await Order.aggregate([
    {
      $match: {
        user: userId,
        status: "completed",
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: "$finalPrice" },
        totalOrders: { $sum: 1 },
        avgOrderValue: { $avg: "$finalPrice" },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: summary[0] || {
      totalSpent: 0,
      totalOrders: 0,
      avgOrderValue: 0,
    },
  });
});

export const getUserTopCategories = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;

  const categories = await Order.aggregate([
    {
      $match: {
        user: userId,
        status: "completed",
        isDeleted: { $ne: true },
      },
    },
    { $unwind: "$products" },

    {
      $lookup: {
        from: "products",
        localField: "products.productId",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },

    {
      $lookup: {
        from: "categories",
        localField: "product.category",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },

    {
      $group: {
        _id: "$category._id",
        categoryName: { $first: "$category.name" },
        totalQuantity: { $sum: "$products.quantity" },
        totalSpent: { $sum: "$products.finalPrice" },
      },
    },

    { $sort: { totalSpent: -1 } },
  ]);

  res.status(200).json({
    success: true,
    results: categories.length,
    data: categories,
  });
});

export const getUserTopProducts = catchAsyncError(async (req, res) => {
  const userId = req.authUser._id;

  const products = await Order.aggregate([
    {
      $match: {
        user: userId,
        status: "completed",
        isDeleted: { $ne: true },
      },
    },
    { $unwind: "$products" },

    {
      $group: {
        _id: "$products.productId",
        totalQuantity: { $sum: "$products.quantity" },
        totalSpent: { $sum: "$products.finalPrice" },
      },
    },

    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },

    {
      $project: {
        _id: 0,
        productId: "$product._id",
        title: "$product.title",
        image: "$product.imageCover",
        totalQuantity: 1,
        totalSpent: 1,
      },
    },

    { $sort: { totalQuantity: -1 } },
    { $limit: 10 },
  ]);

  res.status(200).json({
    success: true,
    results: products.length,
    data: products,
  });
});
