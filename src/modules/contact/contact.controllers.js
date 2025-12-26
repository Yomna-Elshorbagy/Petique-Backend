import { AppError, catchAsyncError } from "../../utils/catch-error.js";
import { sendContactMail } from "../../utils/emails/contectEmail.js";
import Contact from "../../../database/models/contact.model.js";
import { transporter } from "../../utils/emails/email.js";
import { contactSchema } from "./contact.validation.js";
import { replay } from "../../utils/constant/enums.js";

export const contactUs = catchAsyncError(async (req, res, next) => {
  const { error } = contactSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const { fullName, email, message, category, urgency, petAge } = req.body;

  await sendContactMail({
    fullName,
    email,
    message,
    category,
    urgency,
    petAge,
  });

  await Contact.create({
    fullName,
    email,
    message,
    category,
    urgency,
    petAge,
  });

  return res.status(200).json({
    success: true,
    message: "Your message has been sent successfully!",
  });
});

export const getAllContacts = catchAsyncError(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const filter = { isDeleted: { $ne: true } };
  const totalContacts = await Contact.countDocuments(filter);
  const totalPages = Math.ceil(totalContacts / limit);

  const contacts = await Contact.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    message: "Contacts fetched successfully",
    pagination: {
      currentPage: page,
      totalPages,
      totalContacts,
    },
    data: contacts,
  });
});

export const replyToContact = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { replyMessage } = req.body;

  const contact = await Contact.findById(id);
  if (!contact) return next(new AppError("Contact not found", 404));

  await transporter.sendMail({
    from: `"BETCLINIC 🐶🐱" <${process.env.SENDEMAIL}>`,
    to: contact.email,
    subject: "Reply from PETCLINIC Support",
    html: `
    <div style="font-family: 'Poppins', sans-serif; background-color: #eef7ff; padding: 30px;">
      <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 18px; box-shadow: 0 8px 20px rgba(0,0,0,0.08); overflow: hidden;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #709775, #bfd8bd); color: #fff; padding: 28px; text-align: center;">
          <h2 style="margin: 0; font-size: 26px; font-weight: 600;">🐾 PETCLINIC SUPPORT</h2>
          <p style="margin: 6px 0 0; font-size: 15px; opacity: 0.9;">
            Compassionate Care for Every Paw
          </p>
        </div>

        <!-- Body -->
        <div style="padding: 32px;">
          <p style="font-size: 17px; color: #333; margin-bottom: 12px;">
            Hello ${contact.fullName}, 🐾
          </p>

          <p style="font-size: 15px; color: #555; line-height: 1.7; margin-bottom: 20px;">
            Thank you for contacting <b>PETCLINIC Veterinary Center</b>.  
            Our support team has reviewed your message and here is our reply:
          </p>

          <!-- Reply Box -->
          <div style="margin: 25px auto; background-color: #f3faff; padding: 25px; border-radius: 14px; border: 1px solid #d6eaff;">
            <p style="font-size: 16px; color: #444; line-height: 1.8; margin: 0;">
              ${replyMessage}
            </p>
          </div>

          <p style="margin-top: 30px; font-size: 14px; color: #7d7d7d; line-height: 1.6; text-align: center;">
            If you have more questions, feel free to reply to this email.  
            We’re always here to keep your pets happy, healthy, and safe 🩺💚
          </p>
        </div>

        <div style="background-color: #eef7ff; color: #666; text-align: center; padding: 22px; font-size: 13px;">
          <p style="margin: 0;">Sent with ❤️ by <b>PETCLINIC Veterinary Center</b></p>
          <p style="margin-top: 7px;">
            <a href="https://petclinic.com" target="_blank" style="color: #709775; text-decoration: none; font-weight: 600;">
              Visit Our Website
            </a>
          </p>
        </div>

      </div>
    </div>
  `,
  });

  contact.replyMessage = replyMessage;
  contact.replyStatus = "replied";
  contact.repliedAt = new Date();
  await contact.save();

  res.status(200).json({
    success: true,
    message: "Reply sent successfully",
    data: contact,
  });
});
export const deleteContact = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const contact = await Contact.findByIdAndDelete(id);
  if (!contact) return next(new AppError("Contact not found", 404));

  res.status(200).json({
    success: true,
    message: "Contact deleted successfully",
    data: contact,
  });
});

export const softDeleteContact = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const contact = await Contact.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true }
  );

  if (!contact) return next(new AppError("Contact not found", 404));

  res.status(200).json({
    success: true,
    message: "Contact soft deleted successfully",
    data: contact,
  });
});

export const updateContact = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const allowedUpdates = [
    "fullName",
    "email",
    "message",
    "category",
    "urgency",
    "petAge",
    "replyStatus",
    "replyMessage",
  ];

  const updates = Object.keys(req.body);
  const isValidOperation = updates.every((key) => allowedUpdates.includes(key));

  if (!isValidOperation)
    return next(new AppError("Invalid fields for update", 400));

  const contact = await Contact.findById(id);
  if (!contact) return next(new AppError("Contact not found", 404));

  updates.forEach((key) => {
    contact[key] = req.body[key];
  });

  if (contact.replyMessage && contact.replyStatus === replay.REPLIED) {
    contact.repliedAt = new Date();
  }

  await contact.save();

  res.status(200).json({
    success: true,
    message: "Contact updated successfully",
    data: contact,
  });
});


export const getSoftDeletedContacts = catchAsyncError(
  async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const filter = { isDeleted: true };

    const totalContacts = await Contact.countDocuments(filter);
    const totalPages = Math.ceil(totalContacts / limit);

    const contacts = await Contact.find(filter)
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      message: "Soft deleted contacts fetched successfully",
      pagination: {
        currentPage: page,
        totalPages,
        totalContacts,
      },
      data: contacts,
    });
  }
);

export const restoreContact = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const contact = await Contact.findById(id);
  if (!contact) return next(new AppError("Contact not found", 404));

  if (!contact.isDeleted)
    return next(new AppError("Contact is not deleted", 400));

  contact.isDeleted = false;
  contact.deletedAt = undefined;

  await contact.save();

  res.status(200).json({
    success: true,
    message: "Contact restored successfully",
    data: contact,
  });
});
