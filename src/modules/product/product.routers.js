import { Router } from "express";
import * as productControllers from "./product.controllers.js";
import { roles } from "../../utils/constant/enums.js";
import { isAuthenticated, isAuthorized } from "../../middelwares/auth.js";
import { uploadMixFiles } from "../../utils/fileUpload/multer-cloud.js";
import { validate } from "../../middelwares/validate.js";
import { addProductVal } from "./product.validation.js";

const productRouter = Router();
productRouter.get("/getproducts", productControllers.getProducts);

productRouter
  .route("/")
  .post(
    isAuthenticated,
    uploadMixFiles([
      { name: "imageCover", maxCount: 1 },
      { name: "subImages", maxCount: 8 },
    ]),
    validate(addProductVal),
    productControllers.addProduct
  )
  .get(productControllers.getAllProducts);
productRouter.get("/trending", productControllers.getTrendingProducts);
productRouter.get(
  "/topSelling",
  isAuthenticated,
  productControllers.getTopSellingProducts
);
productRouter.get("/lowstock", productControllers.getLowStock);
productRouter.get(
  "/export",
  isAuthenticated,
  productControllers.exportProducts
);
productRouter.get(
  "/get-subscribed-prices",
  isAuthenticated,
  productControllers.getUserPriceSubscriptions
);
productRouter.get("/related/:productId", productControllers.getRelatedProducts);

productRouter.post(
  "/import",
  isAuthenticated,
  productControllers.importProducts
);
// ===== Soft Deleted Products =====
productRouter.get(
  "/getDeleted",
  isAuthenticated,
  productControllers.getSoftDeletedProducts
);

productRouter.put(
  "/restore/:id",
  isAuthenticated,
  productControllers.restoreProduct
);

productRouter.post(
  "/notify-price-drop/:productId",
  isAuthenticated,
  productControllers.notifyUsersPriceDrop
);
productRouter.get(
  "/topSelling",
  isAuthenticated,
  productControllers.getTopSellingProducts
);

productRouter.post(
  "/subscribe-price/:productId",
  isAuthenticated,
  productControllers.subscribeToPriceDrop
);
productRouter.delete(
  "/unsubscribe-price/:productId",
  isAuthenticated,
  productControllers.removePriceDropSubscription
);
productRouter.get(
  "/contact/:productId",
  isAuthenticated,
  productControllers.contactProductOwner
);

productRouter
  .route("/:id")
  .get(productControllers.getSpeCificProduct)
  .put(
    isAuthenticated,
    uploadMixFiles([
      { name: "imageCover", maxCount: 1 },
      { name: "subImages", maxCount: 8 },
    ]),
    productControllers.updateProductCloud
  );
productRouter.get("/related/:productId", productControllers.getRelatedProducts);
productRouter.put(
  "/soft/:id",
  isAuthenticated,
  productControllers.softDeleteProduct
);
productRouter.delete(
  "/:id",
  isAuthenticated,
  productControllers.deleteProduct
);

export default productRouter;
