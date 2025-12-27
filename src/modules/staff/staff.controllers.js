import petModel from "../../../database/models/pet.model.js";
import Reservation from "../../../database/models/reservation.model.js";
import User from "../../../database/models/user.model.js";
import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import { roles } from "../../utils/constant/enums.js";
import { ApiFeature } from "../../utils/file-feature.js";

//======> Reservations
//==> get all reservations
export const getAllReservationsForStaff = catchAsyncError(async (req, res) => {
  const apiFeature = new ApiFeature(
    Reservation.find({ isDeleted: false })
      .populate("petOwner", "userName email mobileNumber")
      .populate("pet", "name type")
      .populate("service", "title priceRange")
      .populate("doctor", "userName email"),
    req.query
  )
    .filter()
    .search()
    .sort()
    .pagination();

  const reservations = await apiFeature.mongooseQuery;

  res.status(200).json({
    success: true,
    count: reservations.length,
    data: reservations,
  });
});

// ===> update reservations by staff
export const updateReservationStatusByStaff = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatus = ["pending", "confirmed", "cancelled", "completed"];
    if (!allowedStatus.includes(status))
      return next(new AppError("Invalid status", 400));

    const reservation = await Reservation.findById(id);
    if (!reservation) return next(new AppError("Reservation not found", 404));

    reservation.status = status;
    await reservation.save();

    res.status(200).json({
      success: true,
      message: "Reservation status updated",
      data: reservation,
    });
  }
);

//===> assign or change doctor
export const assignDoctorToReservation = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params;
    const { doctorId } = req.body;

    const doctor = await User.findOne({
      _id: doctorId,
      role: roles.DOCTORS,
      isActive: true,
    });

    if (!doctor) return next(new AppError("Doctor not found", 404));

    const reservation = await Reservation.findById(id);
    if (!reservation) return next(new AppError("Reservation not found", 404));

    const conflict = await Reservation.findOne({
      doctor: doctorId,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      _id: { $ne: reservation._id },
      isDeleted: false,
    });

    if (conflict)
      return next(new AppError("Doctor already booked in this slot", 409));

    reservation.doctor = doctorId;
    await reservation.save();

    res.status(200).json({
      success: true,
      message: "Doctor assigned successfully",
      data: reservation,
    });
  }
);

//===> get today reservation staff view
export const getTodayReservationsForStaff = catchAsyncError(
  async (req, res) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const reservations = await Reservation.find({
      date: { $gte: start, $lte: end },
      isDeleted: false,
    })
      .sort({ timeSlot: 1 })
      .populate("petOwner pet service doctor");

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  }
);
//======> STATISTICS
// ==> dashboard numbers
export const getStaffDashboardStats = catchAsyncError(async (req, res) => {
  const [totalReservations, todayReservations, totalPets, totalDoctors] =
    await Promise.all([
      Reservation.countDocuments({ isDeleted: false }),
      Reservation.countDocuments({
        date: {
          $gte: new Date().setHours(0, 0, 0, 0),
          $lte: new Date().setHours(23, 59, 59, 999),
        },
        isDeleted: false,
      }),
      petModel.countDocuments({ isDeleted: false }),
      User.countDocuments({ role: roles.DOCTORS, isActive: true }),
    ]);

  res.status(200).json({
    success: true,
    data: {
      totalReservations,
      todayReservations,
      totalPets,
      totalDoctors,
    },
  });
});

//==> reservations by service
export const reservationsPerServiceForStaff = catchAsyncError(
  async (req, res) => {
    const stats = await Reservation.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$serviceName",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: stats,
    });
  }
);

//======> PETS & USERS
//==> get all pets read only
export const getAllPetsForStaff = catchAsyncError(async (req, res) => {
  const pets = await petModel
    .find({ isDeleted: false })
    .populate("petOwner", "userName email")
    .populate("category", "name");

  res.status(200).json({
    success: true,
    count: pets.length,
    data: pets,
  });
});

//==> get all users who are petowners
export const getAllPetOwnersForStaff = catchAsyncError(async (req, res) => {
  const users = await User.find({
    isDeleted: false,
    role: roles.PETOWNER,
  }).select("userName email status");

  res.status(200).json({
    success: true,
    count: users.length,
    data: users,
  });
});

//===> Vaccinations Overview
export const getVaccinationOverviewForStaff = catchAsyncError(
  async (req, res) => {
    const pets = await Pet.find({ isDeleted: false })
      .populate("vaccinationHistory.vaccine", "name")
      .select("name vaccinationHistory");

    const records = [];

    pets.forEach((pet) => {
      pet.vaccinationHistory.forEach((v) => {
        records.push({
          petName: pet.name,
          vaccineName: v.vaccine?.name,
          doseNumber: v.doseNumber,
          status: v.status,
          date: v.date,
          nextDose: v.nextDose,
        });
      });
    });

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  }
);
