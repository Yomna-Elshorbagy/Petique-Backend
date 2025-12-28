import schedule from "node-schedule";

import Order from "../../database/models/order.model.js";
import Category from "../../database/models/category.model.js";
import Product from "../../database/models/product.model.js";
import Coupon from "../../database/models/coupon.model.js";
import Contact from "../../database/models/contact.model.js";
import petModel from "../../database/models/pet.model.js";

/* ===================== CONFIG ===================== */
const DAYS = {
  ORDERS: 90,
  CATEGORIES: 180,
  PRODUCTS: 180,
  COUPONS: 60,
  CONTACTS: 60,
};

/* ===================== HELPERS ===================== */
const getCutoffDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

/* ===================== ORDER CLEANUP ===================== */
schedule.scheduleJob("0 3 * * *", async () => {
  try {
    const orders = await Order.find({
      isDeleted: true,
      deletedAt: { $lte: getCutoffDate(DAYS.ORDERS) },
    });

    if (!orders.length) return;

    await Order.deleteMany({ _id: { $in: orders.map((o) => o._id) } });

    console.log(`🧹 Orders Cleanup: ${orders.length} removed`);
  } catch (err) {
    console.error("❌ Orders Cleanup Failed:", err);
  }
});

/* ===================== CATEGORY CLEANUP ===================== */
schedule.scheduleJob("10 3 * * *", async () => {
  try {
    const categories = await Category.find({
      isDeleted: true,
      deletedAt: { $lte: getCutoffDate(DAYS.CATEGORIES) },
    });

    if (!categories.length) return;

    await Category.deleteMany({ _id: { $in: categories.map((c) => c._id) } });

    console.log(`🧹 Categories Cleanup: ${categories.length} removed`);
  } catch (err) {
    console.error("❌ Categories Cleanup Failed:", err);
  }
});

/* ===================== PRODUCT CLEANUP ===================== */
schedule.scheduleJob("20 3 * * *", async () => {
  try {
    const products = await Product.find({
      isDeleted: true,
      deletedAt: { $lte: getCutoffDate(DAYS.PRODUCTS) },
    });

    if (!products.length) return;

    await Product.deleteMany({ _id: { $in: products.map((p) => p._id) } });

    console.log(`🧹 Products Cleanup: ${products.length} removed`);
  } catch (err) {
    console.error("❌ Products Cleanup Failed:", err);
  }
});

/* ===================== COUPON CLEANUP ===================== */
schedule.scheduleJob("30 3 * * *", async () => {
  try {
    const coupons = await Coupon.find({
      isDeleted: true,
      deletedAt: { $lte: getCutoffDate(DAYS.COUPONS) },
    });

    if (!coupons.length) return;

    await Coupon.deleteMany({ _id: { $in: coupons.map((c) => c._id) } });

    console.log(`🧹 Coupons Cleanup: ${coupons.length} removed`);
  } catch (err) {
    console.error("❌ Coupons Cleanup Failed:", err);
  }
});

/* ===================== CONTACT CLEANUP ===================== */
schedule.scheduleJob("40 3 * * *", async () => {
  try {
    const contacts = await Contact.find({
      isDeleted: true,
      deletedAt: { $lte: getCutoffDate(DAYS.CONTACTS) },
    });

    if (!contacts.length) return;

    await Contact.deleteMany({ _id: { $in: contacts.map((c) => c._id) } });

    console.log(`🧹 Contacts Cleanup: ${contacts.length} removed`);
  } catch (err) {
    console.error("❌ Contacts Cleanup Failed:", err);
  }
});

// ===> for update vaccination status
schedule.scheduleJob("0 0 * * *", async () => {
  const now = new Date();
  await petModel.updateMany(
    {
      "vaccinationHistory.status": "scheduled",
      "vaccinationHistory.nextDose": { $lt: now },
    },
    {
      $set: {
        "vaccinationHistory.$[v].status": "overdue",
      },
    },
    {
      arrayFilters: [
        {
          "v.status": "scheduled",
          "v.nextDose": { $lt: now },
        },
      ],
    }
  );

  console.log("✔ Vaccinations overdue updated");
});
