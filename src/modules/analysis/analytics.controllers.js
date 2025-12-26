import petModel from "../../../database/models/pet.model.js";
import Reservation from "../../../database/models/reservation.model.js";
import vaccinationModel from "../../../database/models/vaccination.model.js";
import { catchAsyncError } from "../../utils/catch-error.js";

// =====> pet analysis

// 1️===> Total pets
export const getTotalPets = catchAsyncError(async (req, res) => {
  const total = await petModel.countDocuments({ isDeleted: false });

  res.status(200).json({
    success: true,
    totalPets: total,
  });
});

// 2️===> Pets per category
export const petsPerCategory = catchAsyncError(async (req, res) => {
  const result = await petModel.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: "$category",
        totalPets: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "animalcategories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },
    {
      $project: {
        _id: 0,
        categoryId: "$category._id",
        categoryName: "$category.name",
        totalPets: 1,
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: result,
  });
});

// 3️===> Pets per user
export const petsPerUser = catchAsyncError(async (req, res) => {
  const result = await petModel.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: "$petOwner",
        totalPets: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "owner",
      },
    },
    { $unwind: "$owner" },
    {
      $project: {
        _id: 0,
        userId: "$owner._id",
        userName: "$owner.userName",
        totalPets: 1,
      },
    },
  ]);

  res.status(200).json({ success: true, data: result });
});

// 4️===> Age distribution
export const petsAgeDistribution = catchAsyncError(async (req, res) => {
  const result = await petModel.aggregate([
    { $match: { isDeleted: false } },
    {
      $bucket: {
        groupBy: "$age",
        boundaries: [0, 1, 3, 6, 10, 20],
        default: "20+",
        output: {
          totalPets: { $sum: 1 },
        },
      },
    },
  ]);

  res.status(200).json({ success: true, data: result });
});

// =======>Vaccination

// 5️===> Vaccination status summary
export const vaccinationStatusSummary = catchAsyncError(async (req, res) => {
  const result = await petModel.aggregate([
    { $unwind: "$vaccinationHistory" },
    {
      $group: {
        _id: "$vaccinationHistory.status",
        total: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: result,
  });
});

// 6️===> Upcoming vaccinations
export const upcomingVaccinations = catchAsyncError(async (req, res) => {
  const today = new Date();

  const result = await petModel
    .find({
      "vaccinationHistory.nextDose": { $gte: today },
      isDeleted: false,
    })
    .select("name image vaccinationHistory")
    .populate("vaccinationHistory.vaccine", "name");

  res.status(200).json({
    success: true,
    data: result,
  });
});

// 7️===> Overdue vaccinations
export const overdueVaccinations = catchAsyncError(async (req, res) => {
  const result = await petModel.aggregate([
    { $unwind: "$vaccinationHistory" },
    {
      $match: {
        "vaccinationHistory.status": "overdue",
      },
    },
    {
      $project: {
        petId: "$_id",
        petName: "$name",
        vaccine: "$vaccinationHistory.vaccine",
        nextDose: "$vaccinationHistory.nextDose",
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: result,
  });
});

//===>Category

// 8️==> Top categories
export const topCategories = catchAsyncError(async (req, res) => {
  const result = await petModel.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: "$category",
        totalPets: { $sum: 1 },
      },
    },
    { $sort: { totalPets: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "animalcategories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },
    {
      $project: {
        categoryName: "$category.name",
        totalPets: 1,
      },
    },
  ]);

  res.status(200).json({ success: true, data: result });
});

// ===> vaccinations/status
export const getVaccinationStatusAnalysis = catchAsyncError(
  async (req, res) => {
    const status = await Vaccination.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: "$doses" },
      { $group: { _id: "$name", total: { $sum: 1 } } },
    ]);

    res.status(200).json({ success: true, data: status });
  }
);
// GET /analytics/vaccinations/top-categories
export const getTopVaccinatedCategories = catchAsyncError(async (req, res) => {
  const top = await vaccinationModel.aggregate([
    { $match: { isDeleted: false } },

    // explode categories array
    { $unwind: "$categories" },

    // lookup category data
    {
      $lookup: {
        from: "animalcategories",
        localField: "categories",
        foreignField: "_id",
        as: "category",
      },
    },

    // category becomes object instead of array
    { $unwind: "$category" },

    // group with populated fields
    {
      $group: {
        _id: {
          id: "$category._id",
          name: "$category.name",
        },
        total: { $sum: 1 },
      },
    },

    { $sort: { total: -1 } },
    { $limit: 5 },
  ]);

  res.status(200).json({
    success: true,
    data: top,
  });
});


export const doctorWorkload = catchAsyncError(async (req, res) => {
  const stats = await Reservation.aggregate([
    { $match: { doctor: { $ne: null }, isDeleted: false } },
    {
      $group: {
        _id: "$doctor",
        totalAppointments: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "doctor",
      },
    },
    { $unwind: "$doctor" },
  ]);

  res.status(200).json({ success: true, data: stats });
});

export const monthlyReservationsTrend = catchAsyncError(async (req, res) => {
  const stats = await Reservation.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: { $month: "$date" },
        total: { $sum: 1 },
      },
    },
    { $sort: { "_id": 1 } },
  ]);

  res.status(200).json({ success: true, data: stats });
});


export const getResRevenueAnalysis = catchAsyncError(async (req, res) => {
  const revenue = await Reservation.aggregate([
    {
      $match: {
        paymentStatus: "paid",
        isDeleted: false,
      },
    },

    {
      $lookup: {
        from: "services",
        localField: "service",
        foreignField: "_id",
        as: "service",
      },
    },

    { $unwind: "$service" },

    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$service.priceRange" },
        totalReservations: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: revenue[0] || { totalRevenue: 0, totalReservations: 0 },
  });
});


// ====> get monthly revenues
export const getMonthlyRevenue = catchAsyncError(async (req, res, next) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const revenue = await Reservation.aggregate([
    {
      $match: {
        isDeleted: false,
        paymentStatus: "paid",
        date: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        },
      },
    },
    {
      $lookup: {
        from: "services",
        localField: "service",
        foreignField: "_id",
        as: "serviceDetails",
      },
    },
    { $unwind: "$serviceDetails" },
    {
      $group: {
        _id: { month: { $month: "$date" }, year: { $year: "$date" } },
        totalRevenue: { $sum: "$serviceDetails.priceRange" },
        totalReservations: { $sum: 1 },
      },
    },
    { $sort: { "_id.month": 1 } },
  ]);

  res.status(200).json({
    success: true,
    year,
    data: revenue.map((r) => ({
      month: r._id.month,
      year: r._id.year,
      totalRevenue: r.totalRevenue,
      totalReservations: r.totalReservations,
    })),
  });
});
