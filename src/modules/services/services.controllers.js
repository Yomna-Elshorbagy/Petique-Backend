import Service from "../../../database/models/service.model.js";
import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import cloudinary from "../../utils/fileUpload/cloudinary.js";
import { deleteCloud } from "../../utils/fileUpload/file-functions.js";
import { messages } from "../../utils/constant/messages.js";
import { ApiFeature } from "../../utils/file-feature.js";

// =======> add services
export const addService = catchAsyncError(async (req, res, next) => {
  const {
    title,
    description,
    priceRange,
    preparations,
    benefits,
    tips,
    duration,
    category
  } = req.body;

  if (!req.files?.image || req.files.image.length === 0) {
    return next(new AppError("Service image is required", 400));
  }

  const { secure_url, public_id } = await cloudinary.uploader.upload(
    req.files.image[0].path,
    { folder: "PetsClinic/services/images" }
  );

  const subImages = [];
  if (req.files.subImages && req.files.subImages.length > 0) {
    for (const file of req.files.subImages) {
      const { secure_url, public_id } = await cloudinary.uploader.upload(
        file.path,
        { folder: "PetsClinic/services/subImages" }
      );
      subImages.push({ secure_url, public_id });
    }
  }

  const newService = new Service({
    title,
    description,
    priceRange,
    preparations,
    image: { secure_url, public_id },
    subImages,
    createdBy: req.authUser._id,
    updatedBy: req.authUser._id,
    benefits,
    tips,
    duration,
    category
  });

  await newService.save();

  res.status(201).json({
    success: true,
    message:
      messages.service.createdSuccessfully || "Service created successfully",
    data: newService,
  });
});

// ===> Get all services WITH API FEATURE
export const getAllServices = catchAsyncError(async (req, res) => {
  const apiFeature = new ApiFeature(
    Service.find({ isDeleted: { $ne: true } }).populate({
      path: "createdBy",
      select: ["userName", "email", "mobileNumber"],
    }),
    req.query
  )
    .filter()
    .search()
    .pagination()
    .sort()
    .select();

  const services = await apiFeature.mongooseQuery;

  const totalDocuments = await Service.countDocuments({
    isDeleted: { $ne: true },
  });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.size) || 100;
  const numberOfPages = Math.ceil(totalDocuments / limit);

  res.status(200).json({
    success: true,
    message: "All services",
    count: services.length,
    metadata: {
      currentPage: page,
      limit,
      numberOfPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < numberOfPages ? page + 1 : null,
    },
    data: services,
  });
});

// =======> get specific services
export const getService = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const service = await Service.findById(id);
  if (!service) return next(new AppError("Service not found", 404));
  res
    .status(200)
    .json({ success: true, message: "Service is: ", data: service });
});

// =======> update service
export const updateService = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const service = await Service.findById(id);
  if (!service) return next(new AppError("Service not found", 404));

  if (
    service.createdBy.toString() !== req.authUser._id.toString() &&
    req.authUser.role !== "doctor" &&
    req.authUser.role !== "owner"
  ) {
    return next(new AppError("Not authorized", 403));
  }

  // update main image if provided
  if (req.files?.image) {
    await deleteCloud(service.image?.public_id);
    const { secure_url, public_id } = await cloudinary.uploader.upload(
      req.files.image[0].path,
      { folder: "PetsClinic/services/images" }
    );
    service.image = { secure_url, public_id };
  }

  // update subImages
  if (req.files?.subImages) {
    for (const img of service.subImages) {
      if (img.public_id) await deleteCloud(img.public_id);
    }
    const subImages = [];
    for (const file of req.files.subImages) {
      const { secure_url, public_id } = await cloudinary.uploader.upload(
        file.path,
        { folder: "PetsClinic/services/subImages" }
      );
      subImages.push({ secure_url, public_id });
    }
    service.subImages = subImages;
  }

  const updatableFields = [
    "title",
    "description",
    "priceRange",
    "preparations",
    "benefits",
    "tips",
    "duration",
  ];
  updatableFields.forEach((field) => {
    if (req.body[field] !== undefined) service[field] = req.body[field];
  });

  service.updatedBy = req.authUser._id;
  await service.save();

  res
    .status(200)
    .json({ success: true, message: "updated service: ", data: service });
});

// =======> soft delete
export const softDeleteService = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const service = await Service.findById(id);
  if (!service) return next(new AppError("Service not found", 404));

  if (service.isDeleted)
    return next(new AppError("Service already deleted", 400));

  service.isDeleted = true;
  service.deletedBy = req.authUser._id;
  service.deletedAt = new Date();
  await service.save();

  res
    .status(200)
    .json({ success: true, message: "Service soft deleted", data: service });
});

// =======> hard delete
export const deleteService = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const service = await Service.findById(id);
  if (!service) return next(new AppError("Service not found", 404));

  // Only creator or doctor or owner
  if (
    service.createdBy.toString() !== req.authUser._id.toString() &&
    req.authUser.role !== "doctor" &&
    req.authUser.role !== "owner"
  ) {
    return next(new AppError("Not authorized", 403));
  }

  // delete cloud images
  await deleteCloud(service.image?.public_id);
  for (const img of service.subImages) {
    await deleteCloud(img.public_id);
  }

  await Service.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Service deleted permanently",
    data: service,
  });
});
