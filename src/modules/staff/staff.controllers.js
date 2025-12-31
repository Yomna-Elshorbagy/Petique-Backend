import petModel from "./../../../database/models/pet.model.js";
import Reservation from "./../../../database/models/reservation.model.js";
import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import { roles } from "../../utils/constant/enums.js";
import { ApiFeature } from "../../utils/file-feature.js";
import User from "./../../../database/models/user.model.js";
import cloudinary from "../../utils/fileUpload/cloudinary.js";
import mongoose from "mongoose";
import notificationModel from "../../../database/models/notification.model.js";
import animalCategoryModel from "../../../database/models/animalCategory.model.js";
import Service from "../../../database/models/service.model.js";
import { TIME_SLOTS } from "../../utils/constant/timeSlots.js";

//======> Staff
// ==> get all Employee
export const getAllEmployee = catchAsyncError(async (req, res, next) => {
  const Employee = await User.find({
    role: roles.STAFF,
    status: { $ne: status.DELETED },
  }).select("userName email mobileNumber image");

  res.status(200).json({
    success: true,
    data: Employee,
  });
});

// ==> add new Employee
export const addNewEmployee = catchAsyncError(async (req, res, next) => {
  const { userName, email, password, mobileNumber, gender } = req.body;

  // ===> 1- Check existing doctor by email or phone
  const existing = await User.findOne({
    $or: [{ email }, { mobileNumber }],
  });
  if (existing) return next(new AppError("Employee already exists", 409));

  // ===> 2- Hash password
  const hashedPassword = hashedPass({
    password,
    saltRounds: Number(process.env.SALT_ROUNDS),
  });

  // ===> 3- upload image if attached
  let imageData = null;

  if (req.file) {
    const { secure_url, public_id } = await cloudinary.uploader.upload(
      req.file.path,
      { folder: "PetsClinic/Employees" }
    );

    imageData = { secure_url, public_id };
  }

  // ===> 4- create Employee
  const Employee = await User.create({
    userName,
    email,
    password: hashedPassword,
    mobileNumber,
    gender,
    image: imageData,
    role: roles.STAFF,
    status: status.VERIFIED,
    isVerified: true,
    passwordChangedAt: Date.now(),
  });

  Employee.password = undefined;

  res.status(201).json({
    message: "Employee created successfully",
    success: true,
    data: Employee,
  });
});

// ==> soft delete Employee
export const softDeletedEmployee = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const Employee = await User.findOne({ _id: id, role: roles.STAFF });
  if (!Employee) return next(new AppError("employee not found", 404));

  const softDeletedEmployee = await User.findByIdAndUpdate(
    id,
    { status: status.DELETED },
    { new: true }
  );

  if (!softDeletedEmployee)
    return next(new AppError("Failed to delete Employee", 500));

  softDeletedEmployee.password = undefined;

  res.status(200).json({
    success: true,
    message: "Employee soft deleted successfully",
    data: softDeletedEmployee,
  });
});
// ==> hard delete Employee
export const deleteEmployee = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const employee = await User.findOne({ _id: id, role: roles.STAFF });
  if (!employee) return next(new AppError("Employee not found", 404));

  if (employee.image?.public_id) {
    await deleteCloud(employee.image.public_id);
  }

  const deleted = await User.deleteOne({ _id: id });
  if (!deleted) return next(new AppError("Failed to delete employee", 500));

  res.status(200).json({
    success: true,
    message: "employee hard deleted successfully",
  });
});

// ==> update doctor profile (admin or doctor himself)
export const updateEmployee = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  let employee = await User.findOne({ _id: id, role: roles.STAFF });
  if (!employee) return next(new AppError("Employee not found", 404));

  const { userName, mobileNumber, gender, newPassword, confirmPassword } =
    req.body;

  // ===> Check phone number uniqueness
  if (mobileNumber && mobileNumber !== employee.mobileNumber) {
    const exists = await User.findOne({
      mobileNumber,
      _id: { $ne: id },
    });
    if (exists) return next(new AppError("Mobile number already used", 409));
  }

  // ===> Update image if uploaded
  if (req.file) {
    if (employee.image?.public_id) {
      await deleteCloud(employee.image.public_id);
    }

    const { secure_url, public_id } = await cloudinary.uploader.upload(
      req.file.path,
      { folder: "PetsClinic/Employees" }
    );

    employee.image = { secure_url, public_id };
  }

  // ===> Update password
  if (newPassword || confirmPassword) {
    if (!newPassword || !confirmPassword) {
      return next(new AppError("Both password fields required", 400));
    }
    if (newPassword !== confirmPassword) {
      return next(new AppError("Passwords do not match", 400));
    }

    employee.password = hashedPass({
      password: newPassword,
      saltRounds: Number(process.env.SALT_ROUNDS),
    });

    employee.passwordChangedAt = Date.now();
  }

  // ===> update other profile fields
  if (userName !== undefined) employee.userName = userName;
  if (mobileNumber !== undefined) employee.mobileNumber = mobileNumber;
  if (gender !== undefined) employee.gender = gender;

  const updatedEmployee = await employee.save();
  if (!updatedEmployee)
    return next(new AppError("Failed to update employee", 500));

  updatedEmployee.password = undefined;

  res.status(200).json({
    success: true,
    message: "employee updated successfully",
    data: updatedEmployee,
  });
});

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
    const { status, date, timeSlot } = req.body;

    // ===== Validate status =====
    const allowedStatus = ["pending", "confirmed", "cancelled", "completed"];
    if (status && !allowedStatus.includes(status)) {
      return next(new AppError("Invalid status", 400));
    }

    const reservation = await Reservation.findById(id);
    if (!reservation) return next(new AppError("Reservation not found", 404));

    // ===== If updating date or timeSlot → check conflicts =====
    if (date || timeSlot) {
      const newDate = date ? new Date(date) : reservation.date;
      const newTimeSlot = timeSlot || reservation.timeSlot;

      const conflict = await Reservation.findOne({
        _id: { $ne: reservation._id },
        doctor: reservation.doctor,
        date: newDate,
        timeSlot: newTimeSlot,
        isDeleted: false,
      });

      if (conflict) {
        return next(
          new AppError("Doctor already has a reservation at this time", 409)
        );
      }

      reservation.date = newDate;
      reservation.timeSlot = newTimeSlot;

      // Optional: reset status if date changed
      if (status !== "cancelled") {
        reservation.status = "pending";
      }
    }

    // ===== Update status =====
    if (status) {
      reservation.status = status;
    }

    await reservation.save();

    res.status(200).json({
      success: true,
      message: "Reservation updated successfully",
      data: reservation,
    });
  }
);

//===> add reservation by staff
export const createFullReservationByStaff = catchAsyncError(
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { user, pet, reservation } = req.body;

      // ===================== 1) CREATE OR GET USER =====================
      let petOwner = await User.findOne({
        $or: [{ email: user.email }, { mobileNumber: user.mobileNumber }],
      }).session(session);

      if (!petOwner) {
        petOwner = await User.create(
          [
            {
              userName: user.userName,
              email: user.email,
              mobileNumber: user.mobileNumber,
              gender: user.gender,
              role: roles.PETOWNER,
              status: status.VERIFIED,
              isVerified: true,
            },
          ],
          { session }
        );
        petOwner = petOwner[0];
      }

      // ===================== 2) CREATE PET =====================
      const categoryExist = await animalCategoryModel
        .findOne({
          name: pet.category, 
          isDeleted: false,
        })
        .session(session);

      if (!categoryExist) {
        throw new AppError("Pet category not found", 404);
      }

      const createdPet = await petModel.create(
        [
          {
            petOwner: petOwner._id,
            name: pet.name,
            age: pet.age,
            weight: pet.weight,
            category: categoryExist._id,
            allergies: pet.allergies || [],
          },
        ],
        { session }
      );

      // ===================== 3) VALIDATE SERVICE =====================
      const serviceExist = await Service.findOne({
        _id: reservation.service,
        isDeleted: false,
      }).session(session);

      if (!serviceExist) throw new AppError("Service not found", 404);

      // ===================== 4) VALIDATE DOCTOR =====================
      if (reservation.doctor) {
        const doctorExist = await User.findOne({
          _id: reservation.doctor,
          role: roles.DOCTORS,
          isActive: true,
        }).session(session);

        if (!doctorExist) throw new AppError("Doctor not found", 404);
      }

      // ===================== 5) CHECK TIME SLOT =====================
      if (!TIME_SLOTS.includes(reservation.timeSlot)) {
        throw new AppError("Invalid time slot", 400);
      }

      const conflict = await Reservation.findOne({
        doctor: reservation.doctor,
        date: reservation.date,
        timeSlot: reservation.timeSlot,
        isDeleted: false,
      }).session(session);

      if (conflict) throw new AppError("Time slot already booked", 409);

      // ===================== 6) CREATE RESERVATION =====================
      const createdReservation = await Reservation.create(
        [
          {
            petOwner: petOwner._id,
            pet: createdPet[0]._id,
            service: reservation.service,
            serviceName: serviceExist.title,
            doctor: reservation.doctor || null,
            date: reservation.date,
            timeSlot: reservation.timeSlot,
            notes: reservation.notes,
          },
        ],
        { session }
      );

      // ===================== 7) NOTIFICATION =====================
      await notificationModel.create(
        [
          {
            user: petOwner._id,
            type: "RESERVATION",
            title: "Reservation Created",
            message: `Your reservation for ${serviceExist.title} on ${reservation.date} at ${reservation.timeSlot} was created by staff.`,
            link: `/reservations/${createdReservation[0]._id}`,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      const result = await Reservation.findById(createdReservation[0]._id)
        .populate("pet")
        .populate("petOwner", "userName email mobileNumber")
        .populate("doctor", "userName email")
        .populate("service");

      res.status(201).json({
        success: true,
        message: "User, pet and reservation created successfully",
        data: result,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
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
    role: roles.PETOWNER,
  }).select("userName email status mobileNumber image isActive isVerified");

  res.status(200).json({
    success: true,
    count: users.length,
    data: users,
  });
});

//===> get pet owner full details with pets & vaccinations
export const getPetOwnerDetailsForStaff = catchAsyncError(
  async (req, res, next) => {
    const { userId } = req.params;

    const user = await User.findOne({
      _id: userId,
      role: roles.PETOWNER,
    }).select("userName email mobileNumber status image");

    if (!user) return next(new AppError("Pet owner not found", 404));

    const pets = await petModel
      .find({
        petOwner: userId,
        isDeleted: false,
      })
      .populate("category", "name")
      .populate("vaccinationHistory.vaccine", "name doses")
      .lean();
    const reservations = await Reservation.find({
      petOwner: userId,
      isDeleted: false,
    })
      .populate("pet", "name")
      .populate("service", "title priceRange")
      .populate("doctor", "userName email")
      .sort({ date: -1 });

    const now = new Date();

    const petsWithComputedVaccinations = pets.map((pet) => {
      const vaccinationHistoryWithStatus = pet.vaccinationHistory.map((v) => {
        let computedStatus = v.status;

        if (
          v.status === "scheduled" &&
          v.nextDose &&
          new Date(v.nextDose) < now
        ) {
          computedStatus = "overdue";
        }

        return {
          ...v,
          status: computedStatus,
        };
      });

      return {
        ...pet,
        vaccinationHistoryWithStatus,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        user,
        pets: petsWithComputedVaccinations,
        reservations,
      },
    });
  }
);

//===> Vaccinations Overview
//===> Vaccinations Overview Table for Staff
export const getVaccinationOverviewForStaff = catchAsyncError(
  async (req, res) => {
    const pets = await petModel
      .find({
        isDeleted: false,
        vaccinationHistory: { $exists: true, $ne: [] },
      })
      .populate("petOwner", "userName mobileNumber")
      .populate("category", "name")
      .populate("vaccinationHistory.vaccine", "name")
      .select("name age image petOwner vaccinationHistory weight category");

    const records = [];

    pets.forEach((pet) => {
      pet.vaccinationHistoryWithStatus.forEach((v) => {
        records.push({
          // ===== Pet Info =====
          petId: pet._id,
          petName: pet.name,
          petImage: pet.image?.secure_url,
          age: pet.age,
          category: pet.category?.name,
          weight: pet.weight,

          // ===== Owner Info =====
          ownerName: pet.petOwner?.userName,
          ownerMobile: pet.petOwner?.mobileNumber,

          // ===== Vaccination Info =====
          vaccineName: v.vaccine?.name,
          vaccinationHistoryId: v?._id,
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
//===> update pet vaccination (status / dates) by staff
export const updatePetVaccinationByStaff = catchAsyncError(
  async (req, res, next) => {
    const { petId, vaccinationHistoryId } = req.params;
    const { status, date, nextDose, doseNumber } = req.body;

    const allowedStatus = ["scheduled", "completed", "overdue"];
    if (status && !allowedStatus.includes(status))
      return next(new AppError("Invalid vaccination status", 400));

    const pet = await petModel.findOne({
      _id: petId,
      isDeleted: false,
    });

    if (!pet) return next(new AppError("Pet not found", 404));

    const vaccination = pet.vaccinationHistory.id(vaccinationHistoryId);
    if (!vaccination)
      return next(new AppError("Vaccination record not found", 404));

    //==== completed vaccines cannot be reschedualed ====
    if (vaccination.status === "completed") {
      return next(
        new AppError(
          "Completed vaccination cannot be modified or rescheduled",
          400
        )
      );
    }

    // ===== Update fields =====
    if (status) vaccination.status = status;
    if (date) vaccination.date = date;
    if (nextDose) vaccination.nextDose = nextDose;
    if (doseNumber !== undefined) vaccination.doseNumber = doseNumber;

    await pet.save();

    res.status(200).json({
      success: true,
      message: "Vaccination updated successfully",
      data: vaccination,
    });
  }
);
