import Reservation from "../../../database/models/reservation.model.js";
import Pet from "../../../database/models/pet.model.js";
import User from "../../../database/models/user.model.js";
import Service from "../../../database/models/service.model.js";

import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import { ApiFeature } from "../../utils/file-feature.js";
import { roles } from "../../utils/constant/enums.js";
import { TIME_SLOTS } from "../../utils/constant/timeSlots.js";
import notificationModel from "../../../database/models/notification.model.js";

// ===> Create reservation
export const createReservation = catchAsyncError(async (req, res, next) => {
  const { pet, service, doctor, date, timeSlot, notes } = req.body;

  // ===> 1) validate pet exists & belongs to logged-in user
  const petExist = await Pet.findOne({
    _id: pet,
    petOwner: req.authUser._id,
    isDeleted: false,
  });
  if (!petExist)
    return next(new AppError("Pet not found or does not belong to you", 404));

  // ===> 2) Validate service exists
  const serviceExist = await Service.findOne({
    _id: service,
    isDeleted: false,
  });
  if (!serviceExist) return next(new AppError("Service not found", 404));

  // ===> 3) If doctor is selected → ensure doctor exists AND role is DOCTOR
  if (doctor) {
    const doctorData = await User.findOne({
      _id: doctor,
      role: roles.DOCTORS,
      isActive: true,
    });
    if (!doctorData)
      return next(new AppError("Doctor not found or not verified", 404));
  }

  // ===> 4) Validate timeSlot exists
  if (!TIME_SLOTS.includes(timeSlot)) {
    return next(new AppError("Invalid time slot", 400));
  }

  // ===> 5) Validate date is in the future
  const chosenDate = new Date(date);
  if (chosenDate < new Date())
    return next(new AppError("Reservation date must be in the future", 400));

  // ===> 6) Check if timeslot is already taken (only when doctor exists)
  if (doctor) {
    const conflict = await Reservation.findOne({
      doctor,
      date,
      timeSlot,
      isDeleted: false,
    });

    if (conflict)
      return next(
        new AppError("This time slot is already taken for this doctor", 409)
      );
  }

  // ===> 7) Create reservation
  const reservation = await Reservation.create({
    petOwner: req.authUser._id,
    pet,
    service,
    serviceName: serviceExist.title,
    doctor: doctor || null,
    date,
    timeSlot,
    notes,
  });
  await notificationModel.create({
    user: req.authUser._id,
    type: "RESERVATION",
    title: "You Make Reservation",
    message: `Your reservation for ${serviceExist.title} on ${date} at ${timeSlot} has been confirmed.`,
    link: `/reservations/${reservation._id}`,
  });
  // ===> 8) Return populated object
  const result = await Reservation.findById(reservation._id)
    .populate("pet")
    .populate("petOwner", "userName email mobileNumber")
    .populate("doctor", "userName email mobileNumber role")
    .populate("service");

  res.status(201).json({
    success: true,
    message: "Reservation created successfully",
    data: result,
  });
});

// ======================= UPDATE RESERVATION ======================== //
export const updateReservation = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const reservation = await Reservation.findById(id);
  if (!reservation) return next(new AppError("Reservation not found", 404));

  const { pet, service, doctor, date, timeSlot, notes, status, paymentStatus } =
    req.body;

  if (paymentStatus) reservation.paymentStatus = paymentStatus;

  // validate pet
  if (pet) {
    const petExist = await Pet.findOne({
      _id: pet,
      isDeleted: false,
    });
    if (!petExist) return next(new AppError("Pet not found", 404));
    reservation.pet = pet;
  }

  // validate service
  if (service) {
    const serviceExist = await Service.findOne({
      _id: service,
      isDeleted: false,
    });
    if (!serviceExist) return next(new AppError("Service not found", 404));

    reservation.service = service;
    reservation.serviceName = serviceExist.title;
  }

  // validate doctor
  if (doctor === null || doctor === "") {
    reservation.doctor = null;
  } else if (doctor) {
    const doctorExist = await User.findOne({
      _id: doctor,
      role: roles.DOCTORS,
      isActive: true,
    });
    if (!doctorExist) return next(new AppError("Doctor not found", 404));

    reservation.doctor = doctor;
  }

  // validate date
  // if (date) {
  //   const newDate = new Date(date);
  //   newDate.setHours(23, 59, 59, 999);
  //   reservation.date = newDate;
  // }

  // validate timeSlot
  if (timeSlot) {
    if (!TIME_SLOTS.includes(timeSlot))
      return next(new AppError("Invalid time slot", 400));
    reservation.timeSlot = timeSlot;
  }

  // check time slot conflict if doctor/date changed
  if (reservation.doctor && reservation.date && reservation.timeSlot) {
    const conflict = await Reservation.findOne({
      doctor: reservation.doctor,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      _id: { $ne: reservation._id },
      isDeleted: false,
    });

    if (conflict) {
      return next(
        new AppError("This time slot is already booked for this doctor", 409)
      );
    }
  }

  if (notes) reservation.notes = notes;
  if (status) reservation.status = status;

  await reservation.save();

  const final = await Reservation.findById(reservation._id)
    .populate("pet")
    .populate("petOwner", "userName email mobileNumber")
    .populate("doctor", "userName email mobileNumber role")
    .populate("service");

  res.status(200).json({
    success: true,
    message: "Reservation updated successfully",
    data: final,
  });
});

//===> create reservation for admin
export const createReservationForAdmin = catchAsyncError(
  async (req, res, next) => {
    const { userId, pet, service, doctor, date, timeSlot, notes } = req.body;

    // 1) Validate user exists
    const userExist = await User.findById(userId);
    if (!userExist) return next(new AppError("User not found", 404));

    // 2) Validate pet exists & belongs to selected user
    const petExist = await Pet.findOne({
      _id: pet,
      petOwner: userId,
      isDeleted: false,
    });
    if (!petExist)
      return next(
        new AppError("Pet not found or does not belong to selected user", 404)
      );

    // 3) Validate service exists
    const serviceExist = await Service.findOne({
      _id: service,
      isDeleted: false,
    });
    if (!serviceExist) return next(new AppError("Service not found", 404));

    // 4) Validate doctor (optional)
    if (doctor) {
      const doctorExist = await User.findOne({
        _id: doctor,
        role: roles.DOCTORS,
        isActive: true,
      });
      if (!doctorExist)
        return next(new AppError("Doctor not found or not active", 404));
    }

    // 5) Validate timeSlot
    if (!TIME_SLOTS.includes(timeSlot)) {
      return next(new AppError("Invalid time slot", 400));
    }

    // 6) Validate date
    const chosenDate = new Date(date);
    if (chosenDate < new Date())
      return next(new AppError("Reservation date must be in the future", 400));

    // 7) Check if time slot is already taken
    if (doctor) {
      const conflict = await Reservation.findOne({
        doctor,
        date,
        timeSlot,
        isDeleted: false,
      });
      if (conflict)
        return next(
          new AppError("This time slot is already taken for this doctor", 409)
        );
    }

    // 8) Create reservation
    const reservation = await Reservation.create({
      petOwner: userId, // admin can set any user
      pet,
      service,
      serviceName: serviceExist.title,
      doctor: doctor || null,
      date,
      timeSlot,
      notes,
    });

    // 9) Notify user
    await notificationModel.create({
      user: userId,
      type: "RESERVATION",
      title: "Admin Created Reservation",
      message: `Your reservation for ${serviceExist.title} on ${date} at ${timeSlot} has been created by admin.`,
      link: `/reservations/${reservation._id}`,
    });

    // 10) Return populated reservation
    const result = await Reservation.findById(reservation._id)
      .populate("pet")
      .populate("petOwner", "userName email mobileNumber")
      .populate("doctor", "userName email mobileNumber role")
      .populate("service");

    res.status(201).json({
      success: true,
      message: "Reservation created successfully by admin",
      data: result,
    });
  }
);

//===> get all reservations
export const getReservations = catchAsyncError(async (req, res, next) => {
  const apiFeature = new ApiFeature(
    Reservation.find({ isDeleted: { $ne: true } })
      .populate("petOwner", ["userName", "email", "mobileNumber"])
      .populate("pet", ["name", "age", "type"])
      .populate("service", ["title", "priceRange"])
      .populate("doctor", ["userName", "email"]),
    req.query
  )
    .filter()
    .search()
    .pagination()
    .sort()
    .select();

  const reservations = await apiFeature.mongooseQuery;
  const total = await Reservation.countDocuments({ isDeleted: { $ne: true } });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.size) || 100;
  const numberOfPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    results: reservations.length,
    metadata: {
      currentPage: page,
      numberOfPages,
      limit,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < numberOfPages ? page + 1 : null,
    },
    data: reservations,
  });
});

//===> get reservation by id
export const getSpecificReservation = catchAsyncError(
  async (req, res, next) => {
    const { id } = req.params;

    const reservation = await Reservation.findById(id)
      .populate("petOwner", ["userName", "email"])
      .populate("pet", ["name", "type"])
      .populate("service", ["title", "priceRange"])
      .populate("doctor", ["userName", "email"]);

    if (!reservation) return next(new AppError("Reservation not found", 404));

    res.status(200).json({ success: true, data: reservation });
  }
);

//==> soft delete
export const softDeleteReservation = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const reservation = await Reservation.findById(id);
  if (!reservation) return next(new AppError("Reservation not found", 404));

  if (reservation.isDeleted)
    return next(new AppError("Reservation already deleted", 400));

  reservation.isDeleted = true;
  reservation.deletedBy = req.authUser._id;
  reservation.deletedAt = new Date();

  await reservation.save();

  res.status(200).json({
    success: true,
    message: "Reservation deleted successfully",
    data: reservation,
  });
});

//==> hard delete
export const deleteReservation = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const reservation = await Reservation.findById(id);
  if (!reservation) return next(new AppError("Reservation not found", 404));

  const deleted = await Reservation.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Reservation deleted successfully",
    data: deleted,
  });
});

// ======================= GET RESERVATIONS BY STATUS ======================== //
export const getReservationsByStatus = catchAsyncError(
  async (req, res, next) => {
    const { status } = req.params;

    const allowed = ["pending", "confirmed", "cancelled", "completed"];
    if (!allowed.includes(status))
      return next(new AppError("Invalid status value", 400));

    const reservations = await Reservation.find({
      status,
      isDeleted: false,
    })
      .populate("petOwner", "userName email")
      .populate("pet")
      .populate("service")
      .populate("doctor");

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  }
);

// ======================= GET UPCOMING RESERVATIONS ======================== //
export const getUpcomingReservations = catchAsyncError(
  async (req, res, next) => {
    const today = new Date();
    const reservations = await Reservation.find({
      date: { $gte: today },
      isDeleted: false,
    })
      .sort({ date: 1 })
      .populate("petOwner")
      .populate("pet")
      .populate("service")
      .populate("doctor");

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  }
);

// ======================= GET PAST RESERVATIONS ======================== //
export const getPastReservations = catchAsyncError(async (req, res, next) => {
  const today = new Date();
  const reservations = await Reservation.find({
    date: { $lt: today },
    isDeleted: false,
  })
    .sort({ date: -1 })
    .populate("petOwner")
    .populate("pet")
    .populate("service")
    .populate("doctor");

  res.status(200).json({
    success: true,
    count: reservations.length,
    data: reservations,
  });
});

// ======================= CHECK AVAILABLE TIME SLOTS ======================== //
export const checkAvailableSlots = catchAsyncError(async (req, res, next) => {
  const { doctor, date } = req.query;

  if (!doctor || !date)
    return next(new AppError("doctor & date are required", 400));

  // Get taken slots
  const taken = await Reservation.find({
    doctor,
    date,
    isDeleted: false,
  }).select("timeSlot -_id");

  const takenSlots = taken.map((t) => t.timeSlot);
  const availableSlots = TIME_SLOTS.filter(
    (slot) => !takenSlots.includes(slot)
  );

  res.status(200).json({
    success: true,
    date,
    doctor,
    takenSlots,
    availableSlots,
  });
});

// ======================= DOCTOR: TODAY’S APPOINTMENTS ======================== //
export const getDoctorTodayReservations = catchAsyncError(
  async (req, res, next) => {
    if (req.authUser.role !== roles.DOCTORS)
      return next(new AppError("Only doctors can access this", 403));

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const reservations = await Reservation.find({
      doctor: req.authUser._id,
      date: { $gte: startOfDay, $lte: endOfDay }, // Date range query
      isDeleted: false,
    })
      .populate("petOwner")
      .populate("pet")
      .populate("service");

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  }
);

// ======================= DOCTOR: WEEKLY SCHEDULE ======================== //
export const getDoctorWeeklyReservations = catchAsyncError(
  async (req, res, next) => {
    if (req.authUser.role !== roles.DOCTORS)
      return next(new AppError("Only doctors can access this", 403));

    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const reservations = await Reservation.find({
      doctor: req.authUser._id,
      date: { $gte: today, $lte: nextWeek },
      isDeleted: false,
    })
      .sort({ date: 1 })
      .populate("petOwner")
      .populate("pet")
      .populate("service");

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  }
);

// ======================= STATISTICS: TOTAL RESERVATIONS ======================== //
export const getTotalReservations = catchAsyncError(async (req, res, next) => {
  const total = await Reservation.countDocuments({ isDeleted: false });

  res.status(200).json({
    success: true,
    total,
  });
});

// ======================= STATS: RESERVATIONS PER SERVICE ======================== //
export const getReservationsByService = catchAsyncError(
  async (req, res, next) => {
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

// ======================= STATS: DAILY REPORT ======================== //
export const getDailyReservations = catchAsyncError(async (req, res, next) => {
  const date = req.query.date || new Date().toISOString().split("T")[0];

  const list = await Reservation.find({
    date,
    isDeleted: false,
  }).populate("service pet petOwner doctor");

  res.status(200).json({
    success: true,
    date,
    count: list.length,
    data: list,
  });
});

// ======================= STATS: MONTHLY REPORT ======================== //
export const getMonthlyReservations = catchAsyncError(
  async (req, res, next) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    const list = await Reservation.aggregate([
      {
        $match: {
          isDeleted: false,
          date: {
            $gte: new Date(year, month - 1, 1),
            $lt: new Date(year, month, 1),
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
    ]);

    res.status(200).json({
      success: true,
      year,
      month,
      count: list.length,
      data: list,
    });
  }
);

// ======================= MOST ACTIVE DOCTORS ======================== //
export const getMostActiveDoctors = catchAsyncError(async (req, res, next) => {
  const stats = await Reservation.aggregate([
    { $match: { doctor: { $ne: null }, isDeleted: false } },
    {
      $group: {
        _id: "$doctor",
        appointments: { $sum: 1 },
      },
    },
    { $sort: { appointments: -1 } },
    { $limit: 10 },
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

  res.status(200).json({
    success: true,
    data: stats,
  });
});

// ======================= FILTER RESERVATIONS ======================== //
export const filterReservations = catchAsyncError(async (req, res, next) => {
  const { doctor, service, petOwner, status, fromDate, toDate } = req.query;

  const query = { isDeleted: false };

  if (doctor) query.doctor = doctor;
  if (service) query.service = service;
  if (petOwner) query.petOwner = petOwner;
  if (status) query.status = status;

  // ==> date range
  if (fromDate || toDate) {
    query.date = {};
    if (fromDate) query.date.$gte = new Date(fromDate);
    if (toDate) query.date.$lte = new Date(toDate);
  }

  const reservations = await Reservation.find(query)
    .populate("petOwner")
    .populate("pet")
    .populate("service")
    .populate("doctor");

  res.status(200).json({
    success: true,
    count: reservations.length,
    data: reservations,
  });
});

// ======================= GET RESERVATIONS FOR TODAY ======================== //
export const getTodayReservations = catchAsyncError(async (req, res, next) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const reservations = await Reservation.find({
    date: { $gte: startOfDay, $lte: endOfDay },
    isDeleted: false,
  })
    .sort({ timeSlot: 1 })
    .populate("petOwner", ["userName", "email", "mobileNumber"])
    .populate("pet", ["name", "type"])
    .populate("service", ["title", "priceRange"])
    .populate("doctor", ["userName", "email"]);

  res.status(200).json({
    success: true,
    count: reservations.length,
    data: reservations,
  });
});

// ======================= USER: GET MY RESERVATIONS ======================== //
export const getMyReservations = catchAsyncError(async (req, res, next) => {
  const reservations = await Reservation.find({
    petOwner: req.authUser._id,
    isDeleted: false,
  })
    .sort({ date: 1 })
    .populate({
      path: "pet",
      populate: {
        path: "category",
      },
    })
    .populate("service", ["title", "priceRange"])
    .populate("doctor", ["userName", "email", "mobileNumber"]);

  res.status(200).json({
    success: true,
    count: reservations.length,
    data: reservations,
  });
});

// ======================= USER: UPCOMING APPOINTMENTS ======================== //
export const getMyUpcomingReservations = catchAsyncError(
  async (req, res, next) => {
    const today = new Date();

    const reservations = await Reservation.find({
      petOwner: req.authUser._id,
      date: { $gte: today },
      isDeleted: false,
    })
      .sort({ date: 1 })
      .populate("pet")
      .populate("service")
      .populate("doctor");

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  }
);
// ======================= USER: PAST APPOINTMENTS ======================== //
export const getMyPastReservations = catchAsyncError(async (req, res, next) => {
  const today = new Date();

  const reservations = await Reservation.find({
    petOwner: req.authUser._id,
    date: { $lt: today },
    isDeleted: false,
  })
    .sort({ date: -1 })
    .populate("pet")
    .populate("service")
    .populate("doctor");

  res.status(200).json({
    success: true,
    count: reservations.length,
    data: reservations,
  });
});

// ======================= USER: TRACKER FOR HIS APPOINTMENTS ======================== //
const getTrackerStatus = (reservation) => {
  const now = new Date();

  if (reservation.status === "cancelled") return "cancelled";
  if (reservation.status === "completed") return "completed";

  // past & never confirmed
  if (reservation.status === "pending" && reservation.date < now)
    return "no_show";

  // confirmed but not started
  if (reservation.status === "confirmed" && reservation.date >= now)
    return "confirmed";

  // same day logic
  const sameDay = reservation.date.toDateString() === now.toDateString();

  if (sameDay && reservation.status === "confirmed") {
    return "waiting";
  }

  return "scheduled";
};

export const getTrackReservations = catchAsyncError(async (req, res) => {
  const reservations = await Reservation.find({
    petOwner: req.authUser._id,
    isDeleted: false,
  })
    .populate({
      path: "pet",
      populate: {
        path: "category",
      },
    })
    .populate("service")
    .populate("doctor");

  const enriched = reservations.map((r) => ({
    ...r.toObject(),
    trackerStatus: getTrackerStatus(r),
  }));

  res.status(200).json({
    success: true,
    count: enriched.length,
    data: enriched,
  });
});
