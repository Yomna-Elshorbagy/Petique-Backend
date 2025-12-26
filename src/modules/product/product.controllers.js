import Category from "../../../database/models/category.model.js";
import Order from "../../../database/models/order.model.js";
import { PriceAlert } from "../../../database/models/priceAlert.model.js";
import Product from "../../../database/models/product.model.js";
import User from "../../../database/models/user.model.js";
import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import { messages } from "../../utils/constant/messages.js";
import { notifyUsersAboutPriceDrop } from "../../utils/emails/email.js";
import { ApiFeature } from "../../utils/file-feature.js";
import cloudinary from "../../utils/fileUpload/cloudinary.js";
import { deleteCloud } from "../../utils/fileUpload/file-functions.js";

export const addProduct = catchAsyncError(async (req, res, next) => {
  let {
    title,
    description,
    imageCover,
    subImages = [],
    price,
    discount,
    stock,
    category,
  } = req.body;

  const categoryExists = await Category.findById(category);
  if (!categoryExists) {
    return next(new AppError(messages.category.notFound, 404));
  }

  let failImages = [];
  const { secure_url, public_id } = await cloudinary.uploader.upload(
    req.files.imageCover[0].path,
    { folder: "PetsClinic/product/imageCover" }
  );
  failImages.push(public_id);
  imageCover = { secure_url, public_id };

  for (const file of req.files.subImages) {
    const { secure_url, public_id } = await cloudinary.uploader.upload(
      file.path,
      { folder: "PetsClinic/product/subImages" }
    );
    subImages.push({ secure_url, public_id });
    failImages.push(public_id);
  }
  // add to database
  let newProduct = new Product({
    title,
    description,
    imageCover,
    subImages,
    price,
    discount,
    stock,
    category,
    createdBy: req.authUser._id,
    updatedBy: req.authUser._id,
  });
  const createdPro = await newProduct.save();

  if (!createdPro) {
    req.failImages = public_id;
    return next(new AppError(messages.product.failToCreate, 500));
  }
  res.status(201).json({
    message: messages.product.createdSuccessfully,
    success: true,
    data: newProduct,
  });
});

export const updateProductCloud = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  let product = await Product.findOne({ _id: id });
  if (!product) return next(new AppError(messages.product.notFound, 404));

  // Check if current user is the creator
  // if (
  //   product.createdBy.toString() !== req.authUser._id.toString() &&
  //   req.authUser.role !== "admin"
  // ) {
  //   return next(
  //     new AppError("You are not authorized to Update this product", 403)
  //   );
  // }

  let failImages = [];

  if (req.files && req.files.imageCover) {
    await deleteCloud(product.imageCover?.public_id);
    const { secure_url, public_id } = await cloudinary.uploader.upload(
      req.files.imageCover[0].path,
      { folder: "PetsClinic/product/imageCover" }
    );
    failImages.push(public_id);
    product.imageCover = { secure_url, public_id };
  }

  if (req.files && req.files.subImages) {
    const oldSubImagesPublicIds = product.subImages.map((img) => img.public_id);
    product.subImages = [];
    for (const file of req.files.subImages) {
      const { secure_url, public_id } = await cloudinary.uploader.upload(
        file.path,
        { folder: "PetsClinic/product/subImages" }
      );
      product.subImages.push({ secure_url, public_id });
      failImages.push(public_id);
    }
    for (const publicId of oldSubImagesPublicIds) {
      if (publicId) await deleteCloud(publicId);
    }
  }
  const updatableFields = [
    "title",
    "description",
    "price",
    "discount",
    "stock",
    "category",
  ];

  updatableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });
  product.updatedBy = req.authUser._id;

  const updatedProduct = await product.save();
  if (!updatedProduct) {
    req.failImages = failImages;
    return next(new AppError(messages.product.failToUpdate, 500));
  }

  res.status(200).json({
    message: messages.product.updatedSuccessfully,
    success: true,
    data: updatedProduct,
  });
});

export const deleteProduct = catchAsyncError(async (req, res, next) => {
  let { id } = req.params;
  const product = await Product.findById(id);
  if (!product) return next(new AppError(messages.product.notFound, 404));

  // Check if current user is the creator
  if (
    product.createdBy.toString() !== req.authUser._id.toString() &&
    req.authUser.role !== "admin" &&
    req.authUser.role !== "owner"
  ) {
    return next(
      new AppError("You are not authorized to delete this product", 403)
    );
  }

  //delete images
  await cloudinary.uploader.destroy(product.imageCover.public_id);
  for (const image of product.subImages) {
    await cloudinary.uploader.destroy(image.public_id);
  }

  let deleteProduct = await Product.findByIdAndDelete(id);
  if (!deleteProduct)
    return next(new AppError(messages.product.failToUpdate, 500));
  res.status(200).json({
    message: messages.product.deletedSuccessfully,
    success: true,
    data: deleteProduct,
  });
});

export const getLowStock = catchAsyncError(async (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;
  const products = await Product.find({ stock: { $lte: threshold } });
  res.json({ success: true, threshold, count: products.length, products });
});

export const getAllProducts = catchAsyncError(async (req, res, next) => {
  const Products = await Product.find({ isDeleted: { $ne: true } })
    .populate({
      path: "createdBy",
      select: ["address", "userName", "mobileNumber"],
    })
    .populate({
      path: "category",
      select: ["name", "image", "createdBy"],
    });
  res
    .status(200)
    .json({ success: true, message: "Products are : ", data: Products });
});

export const getSpeCificProduct = catchAsyncError(async (req, res, next) => {
  let { id } = req.params;
  let product = await Product.findById(id)
    .populate({
      path: "createdBy",
      select: ["address", "userName", "mobileNumber"],
    })
    .populate({
      path: "category",
      select: ["name", "slug", "image", "createdBy"],
    });
  if (!product) return next(new AppError(messages.product.notFound, 404));
  res
    .status(200)
    .json({ message: "Product is : ", success: true, data: product });
});

//===> get products but with api feature
export const getProducts = catchAsyncError(async (req, res, next) => {
  const { category, page = 1, size = 100 } = req.query;

  const filter = { isDeleted: { $ne: true } };

  let productQuery = Product.find(filter)
    .populate({
      path: "createdBy",
      select: ["address", "userName", "mobileNumber"],
    })
    .populate({
      path: "category",
      select: ["name", "image", "createdBy"],
    });

  if (category) {
    productQuery = productQuery.where("category").equals(category);
  }

  const apiFeature = new ApiFeature(productQuery, req.query).filter().search();

  const countQuery = new ApiFeature(
    Product.find()
      .populate({
        path: "createdBy",
        select: ["address", "userName", "mobileNumber"],
      })
      .populate({
        path: "category",
        select: ["name", "image", "createdBy"],
      }),
    req.query
  )
    .filter()
    .search();

  const totalDocuments = await countQuery.mongooseQuery.countDocuments();

  apiFeature.pagination().sort().select();
  const products = await apiFeature.mongooseQuery;

  const numberOfPages = Math.ceil(totalDocuments / size);

  return res.json({
    results: products.length,
    metadata: {
      currentPage: parseInt(page),
      numberOfPages,
      limit: parseInt(size),
      prevPage: page > 1 ? page - 1 : null,
    },
    message: messages.product.fetchedSuccessfully,
    success: true,
    data: products,
  });
});

//===> get products from same categories to display it
export const getRelatedProducts = catchAsyncError(async (req, res, next) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) return next(new AppError(messages.product.notFound, 404));

  const relatedProducts = await Product.find({
    category: product.category,
    _id: { $ne: productId }, // exclude the current one
  }).limit(10);

  res.status(200).json({ success: true, relatedProducts });
});

//===> sorts the products in descending order of their views with limit 10 products
export const getTrendingProducts = catchAsyncError(async (req, res, next) => {
  const trendingProducts = await Product.find().sort({ views: -1 }).limit(10);
  res.status(200).json({ success: true, trendingProducts });
});

export const subscribeToPriceDrop = catchAsyncError(async (req, res, next) => {
  const { productId } = req.params;
  const { _id: authUserId } = req.authUser;

  const product = await Product.findById(productId);
  if (!product) return next(new AppError("Product not found", 404));

  const existingAlert = await PriceAlert.findOne({
    user: authUserId,
    product: productId,
  });
  if (existingAlert) {
    return res.status(400).json({
      success: false,
      message: "You are already subscribed to this product's price alerts.",
    });
  }

  const newSubscription = await PriceAlert.create({
    user: authUserId,
    product: productId,
    subscribedPrice: product.price,
  });

  res.status(200).json({
    success: true,
    message: "Subscribed for price drop alerts successfully!",
    subscribedPrice: product.price,
    data: newSubscription,
  });
});

export const contactProductOwner = catchAsyncError(async (req, res, next) => {
  const { _id: authUserId, mobileNumber: authUserMobile } = req.authUser;
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) return next(new AppError(messages.product.notFound, 404));

  const productOwner = await User.findById(product.createdBy);
  if (!productOwner || !productOwner.mobileNumber) {
    return next(new AppError("Product owner not found", 404));
  }

  const formatEgyptianNumber = (number) => {
    let cleanedNumber = number.replace(/\D/g, "");
    if (cleanedNumber.startsWith("0")) {
      cleanedNumber = cleanedNumber.substring(1);
    }
    if (!cleanedNumber.startsWith("20")) {
      cleanedNumber = "20" + cleanedNumber;
    }
    return cleanedNumber;
  };

  const senderPhone = formatEgyptianNumber(authUserMobile);
  const receiverPhone = formatEgyptianNumber(productOwner.mobileNumber);

  const message = encodeURIComponent(
    `Hello! I am interested in your product: ${product.title}`
  );

  const whatsappUrl = `https://api.whatsapp.com/send?phone=${receiverPhone}&text=${message}`;

  res.status(200).json({
    message: "WhatsApp chat link generated successfully",
    success: true,
    chatDetails: {
      sender: {
        userId: authUserId,
        mobileNumber: senderPhone,
      },
      receiver: {
        userId: productOwner._id,
        mobileNumber: receiverPhone,
      },
      whatsappUrl,
    },
  });
});

export const exportProducts = catchAsyncError(async (req, res, next) => {
  const products = await Product.find()
    .populate("category", "name")
    .populate("createdBy", "userName email");

  if (!products.length) {
    return next(new AppError("No products found to export", 404));
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=products_export.json"
  );

  res.status(200).json(products);
});

export const softDeleteProduct = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const product = await Product.findById(id);
  if (!product) return next(new AppError(messages.product.notFound, 404));

   if (
    product.createdBy.toString() !== req.authUser._id.toString() &&
    req.authUser.role !== "admin" &&
    req.authUser.role !== "owner"
  ) {
    return next(
      new AppError("You are not authorized to delete this product", 403)
    );
  }

  if (product.isDeleted)
    return next(new AppError(messages.product.alreadyDeleted, 400));

  product.isDeleted = true;
  product.deletedBy = req.authUser._id;
  product.deletedAt = new Date();

  await product.save();

  res.status(200).json({
    success: true,
    message: messages.product.deletedSuccessfully,
    data: product,
  });
});

export const importProducts = catchAsyncError(async (req, res, next) => {
  const products = req.body;

  if (!Array.isArray(products) || products.length === 0) {
    return next(new AppError("Invalid or empty product data", 400));
  }

  const validProducts = [];

  for (const product of products) {
    if (product.title && product.price && product.category) {
      validProducts.push({
        title: product.title,
        description: product.description || "",
        imageCover: product.imageCover || {},
        subImages: product.subImages || [],
        price: product.price,
        discount: product.discount || 0,
        stock: product.stock || 0,
        category: product.category?._id || product.category,
        createdBy: req.authUser._id,
        updatedBy: req.authUser._id,
      });
    }
  }

  if (!validProducts.length) {
    return next(new AppError("No valid products to import", 400));
  }

  const data = await Product.insertMany(validProducts, { ordered: false });

  res.status(201).json({
    success: true,
    message: `${validProducts.length} products imported successfully`,
    data: data,
  });
});

export const getTopSellingProducts = catchAsyncError(async (req, res, next) => {
  const topProducts = await Order.aggregate([
    { $match: { isDeleted: { $ne: true }, status: "completed" } },

    { $unwind: "$products" },

    {
      $group: {
        _id: "$products.productId",
        totalSold: { $sum: "$products.quantity" },
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

    // Project final shape
    {
      $project: {
        _id: 0,
        title: "$product.title",
        totalSold: 1,
      },
    },

    // Sort by most sold
    { $sort: { totalSold: -1 } },
    { $limit: 5 },
  ]);

  res.status(200).json({
    success: true,
    message: "Top-selling products fetched successfully",
    data: topProducts,
  });
});

export const notifyUsersPriceDrop = catchAsyncError(async (req, res) => {
  const { productId } = req.params;
  const { oldPrice, newPrice } = req.body;

  await notifyUsersAboutPriceDrop(productId, oldPrice, newPrice);

  res.status(200).json({ message: "Notifications sent successfully" });
});

export const removePriceDropSubscription = catchAsyncError(
  async (req, res, next) => {
    const { productId } = req.params;
    const userId = req.authUser._id;

    const subscription = await PriceAlert.findOne({
      user: userId,
      product: productId,
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "You are not subscribed to this product's price alerts.",
      });
    }

    const data = await PriceAlert.findByIdAndDelete(subscription._id);

    res.status(200).json({
      success: true,
      message:
        "You have successfully unsubscribed from price drop alerts for this product.",
      data,
    });
  }
);

export const getUserPriceSubscriptions = catchAsyncError(
  async (req, res, next) => {
    const userId = req.authUser._id;

    const subscriptions = await PriceAlert.find({ user: userId }).populate({
      path: "product",
      select: "_id title price imageCover",
    });

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No active price drop subscriptions found.",
        subscribedProductIds: [],
        data: [],
      });
    }

    const productIds = subscriptions.map((s) => s.product._id);

    res.status(200).json({
      success: true,
      message: "Fetched subscribed price alerts successfully.",
      subscribedProductIds: productIds,
      data: subscriptions,
    });
  }
);

// ===> get Soft Deleted Products
export const getSoftDeletedProducts = catchAsyncError(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const filter = { isDeleted: true };

  const totalProducts = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .populate("category", "name image")
    .populate("createdBy", "userName email")
    .sort({ deletedAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    results: products.length,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
    },
    data: products,
  });
});

// ===> restore Soft Deleted Product
export const restoreProduct = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const product = await Product.findById(id);
  if (!product) return next(new AppError(messages.product.notFound, 404));

  if (!product.isDeleted)
    return next(new AppError("Product is not deleted", 400));

  product.isDeleted = false;
  product.deletedAt = null;
  product.deletedBy = null;
  product.updatedBy = req.authUser._id;

  await product.save();

  res.status(200).json({
    success: true,
    message: "Product restored successfully",
    data: product,
  });
});
