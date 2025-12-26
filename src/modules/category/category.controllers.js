import Category from "../../../database/models/category.model.js";
import Order from "../../../database/models/order.model.js";
import Product from "../../../database/models/product.model.js";
import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import { messages } from "../../utils/constant/messages.js";
import { ApiFeature } from "../../utils/file-feature.js";
import cloudinary from "../../utils/fileUpload/cloudinary.js";
import { deleteCloud } from "../../utils/fileUpload/file-functions.js";

export const getCategoryProductCount = async () => {
  return await Product.aggregate([
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: { $toString: "$_id" },
        count: 1,
      },
    },
  ]);
};

export const addCategoryCloud = catchAsyncError(async (req, res, next) => {
  let { name } = req.body;
  name = name.toLowerCase();
  if (!req.file) {
    return next(new AppError(messages.file.required, 400));
  }
  const catExist = await Category.findOne({ name });
  if (catExist) {
    return next(new AppError(messages.category.alreadyExist, 409));
  }
  const { secure_url, public_id } = await cloudinary.uploader.upload(
    req.file.path,
    {
      folder: "PetsClinic/category",
    }
  );
  const category = new Category({
    name,
    image: { secure_url, public_id },
    createdBy: req.authUser._id,
  });
  const newCate = await category.save();
  if (!newCate) {
    await cloudinary.uploader.destroy(public_id);
    return next(new AppError(messages.category.failToCreate, 500));
  }
  res.status(201).json({
    message: messages.category.createdSuccessfully,
    success: true,
    data: newCate,
  });
});

export const updateCategoryCloud = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { name } = req.body;
  const userId = req.authUser._id;

  const categoryExist = await Category.findById(id);
  if (!categoryExist)
    return next(new AppError(messages.category.notFound, 404));
  const nameExist = await Category.findOne({ name, _id: { $ne: id } });
  if (nameExist) return next(new AppError(messages.category.alreadyExist, 404));

  //prepare data
  if (name) {
    categoryExist.name = name;
  }
  //update image
  if (req.file) {
    //replace by override
    const { secure_url, public_id } = await cloudinary.uploader.upload(
      req.file.path,
      { public_id: categoryExist.image.public_id }
    );
    categoryExist.image = { secure_url, public_id };
  }

  let updateCategory = await categoryExist.save();
  if (!updateCategory) {
    if (req.file) {
      await cloudinary.uploader.destroy(categoryExist.image.public_id);
    }
    return next(new AppError(messages.category.failToUpdate, 500));
  }
  return res.status(200).json({
    message: messages.category.updatedSuccessfully,
    success: true,
    data: updateCategory,
  });
});

export const getCategories = catchAsyncError(async (req, res, next) => {
  const apiFeature = new ApiFeature(
    Category.find({ isDeleted: { $ne: true } }).populate({
      path: "createdBy",
      select: ["userName", "address", "mobileNumber", "image"],
    }),
    req.query
  )
    .filter()
    .search()
    .pagination()
    .sort()
    .select();

  const categories = await apiFeature.mongooseQuery;
  const totalDocuments = await Category.countDocuments({
    isDeleted: { $ne: true },
  });
  const productCounts = await getCategoryProductCount();
  const mergedCategories = categories.map((cat) => {
    const foundCount = productCounts.find(
      (pc) => pc._id === cat._id.toString()
    );
    const count = foundCount ? foundCount.count : 0;
    return { ...cat.toObject(), productCount: count };
  });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.size) || 100;
  const numberOfPages = Math.ceil(totalDocuments / limit);

  return res.json({
    success: true,
    results: mergedCategories.length,
    metadata: {
      currentPage: page,
      numberOfPages,
      limit,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < numberOfPages ? page + 1 : null,
    },
    data: mergedCategories,
  });
});

export const getSpecificCategory = catchAsyncError(async (req, res, next) => {
  let { id } = req.params;
  let category = await Category.findById(id).populate({
    path: "createdBy",
    select: ["userName", "address", "userName", "mobileNumber", "image"],
  });
  category || next(new AppError(messages.category.notFound, 404));
  !category ||
    res.status(200).json({ message: "Category is : ", data: category });
});

export const getAllCategories = catchAsyncError(async (req, res, next) => {
  const categories = await Category.find({ isDeleted: { $ne: true } }).populate(
    {
      path: "createdBy",
      select: ["userName", "address", "userName", "mobileNumber", "image"],
    }
  );
  const productCounts = await getCategoryProductCount();
  const mergedCategories = categories.map((cat) => {
    const foundCount = productCounts.find(
      (pc) => pc._id === cat._id.toString()
    );
    const count = foundCount ? foundCount.count : 0;
    return { ...cat.toObject(), productCount: count };
  });
  res
    .status(200)
    .json({ message: "Categories are : ", data: mergedCategories });
});

export const deleteCategoryCloud = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  let categoryExist = await Category.findByIdAndDelete(id);
  if (!categoryExist)
    return next(new AppError(messages.category.notFound, 404));

  //prepare ids
  const products = await Product.find({ category: id }).select(
    "imageCover subImages"
  );
  const imagePaths = [];
  const productIds = [];
  products.forEach((prod) => {
    imagePaths.push(prod.imageCover);
    imagePaths.push(...prod.subImages);
    productIds.push(prod._id);
  });
  await Product.deleteMany({ _id: { $in: productIds } });

  for (let i = 0; i < imagePaths.length; i++) {
    if (typeof (imagePaths[i] === "string")) {
      deleteCloud(imagePaths[i]);
    } else {
      await cloudinary.uploader.destroy(imagePaths[i].public_id);
    }
  }
  await cloudinary.uploader.destroy(categoryExist.image.public_id);

  res.status(200).json({
    message: messages.category.deletedSuccessfully,
    success: true,
  });
});
export const softDeleteCategory = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const category = await Category.findById(id);
  if (!category) return next(new AppError(messages.category.notFound, 404));

  if (category.isDeleted)
    return next(new AppError(messages.category.alreadyDeleted, 400));

  category.isDeleted = true;
  category.deletedBy = req.authUser._id;
  category.deletedAt = new Date();

  await category.save();

  await Product.updateMany(
    { category: id },
    { isDeleted: true, deletedBy: req.authUser._id, deletedAt: new Date() }
  );

  res.status(200).json({
    success: true,
    message: messages.category.deletedSuccessfully,
    data: category,
  });
});

export const getProductsByCategoryId = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params;
    const baseQuery = Product.find({ category: id }).populate(
      "createdBy",
      "userName"
    );
    const totalProducts = await Product.countDocuments({ category: id });

    const apiFeature = new ApiFeature(baseQuery, req.query)
      .filter()
      .search()
      .pagination()
      .sort()
      .select();

    const products = await apiFeature.mongooseQuery;
    const currentPage = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 100;
    const numberOfPages = Math.ceil(totalProducts / limit);
    const prevPage = currentPage > 1 ? currentPage - 1 : null;
    const nextPage = currentPage < numberOfPages ? currentPage + 1 : null;

    res.status(200).json({
      success: true,
      results: products.length,
      data: products,
      metadata: {
        currentPage,
        numberOfPages,
        limit,
        prevPage,
        nextPage,
      },
    });
  }
);

//===> if there is dashboard we can use these apis:
//===> depending on category that have more products
export const getTrendingCategories = catchAsyncError(async (req, res, next) => {
  const topCategories = await Product.aggregate([
    //==> group products by category and count them
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } }, //==> sort descending
    { $limit: 5 },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },
  ]);

  res.status(200).json({
    success: true,
    data: topCategories,
  });
});

// ==> indicates: how many categories exist - Which category was added most recently - how many products belong to each category.
export const getCategoryStats = catchAsyncError(async (req, res, next) => {
  try {
    const totalCategories = await Category.countDocuments();

    const latest = await Category.find()
      .sort({ createdAt: -1 })
      .limit(1)
      .select("name createdAt image");

    const productsPerCategory = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      { $unwind: { path: "$categoryInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          categoryId: "$_id",
          categoryName: "$categoryInfo.name",
          count: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCategories,
        latest,
        productsPerCategory,
      },
    });
  } catch (error) {
    console.error("getCategoryStats error:", error);
    return next(new AppError("Failed to fetch category stats", 500));
  }
});

export const getRevenueDistribution = catchAsyncError(
  async (req, res, next) => {
    const data = await Order.aggregate([
      {
        $match: { status: "completed" },
      },
      { $unwind: "$products" },
      {
        $lookup: {
          from: "products",
          localField: "products.productId",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },
      {
        $lookup: {
          from: "categories",
          localField: "productInfo.category",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      { $unwind: "$categoryInfo" },
      {
        $group: {
          _id: "$categoryInfo.name",
          totalRevenue: { $sum: "$products.finalPrice" },
        },
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          totalRevenue: 1,
        },
      },
    ]);
    return res.status(200).json({ success: true, data });
  }
);

//===> return soft deleted data 
export const getSoftDeletedCategories = catchAsyncError(
  async (req, res, next) => {
    const categories = await Category.find({ isDeleted: true }).populate({
      path: "deletedBy",
      select: ["userName", "email"],
    });

    const productCounts = await Product.aggregate([
      {
        $match: { isDeleted: true },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: { $toString: "$_id" },
          count: 1,
        },
      },
    ]);

    const merged = categories.map((cat) => {
      const found = productCounts.find(
        (pc) => pc._id === cat._id.toString()
      );
      return {
        ...cat.toObject(),
        productCount: found ? found.count : 0,
      };
    });

    res.status(200).json({
      success: true,
      results: merged.length,
      data: merged,
    });
  }
);

//===> restore categories soft deleted with its products 
export const restoreCategory = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const category = await Category.findById(id);
  if (!category)
    return next(new AppError(messages.category.notFound, 404));

  if (!category.isDeleted)
    return next(new AppError("Category is not deleted", 400));

  // restore category
  category.isDeleted = false;
  category.deletedBy = undefined;
  category.deletedAt = undefined;

  await category.save();

  // restore products under this category
  await Product.updateMany(
    { category: id },
    {
      isDeleted: false,
      deletedBy: undefined,
      deletedAt: undefined,
    }
  );

  res.status(200).json({
    success: true,
    message: "Category restored successfully",
    data: category,
  });
});
