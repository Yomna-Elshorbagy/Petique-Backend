import { Router } from "express";

import * as contactControllers from "./contact.controllers.js";
import { isAuthenticated } from "../../middelwares/auth.js";

const contactRouter = Router();

contactRouter.post("/", contactControllers.contactUs);
contactRouter.get("/", isAuthenticated, contactControllers.getAllContacts);
contactRouter.get(
  "/getDeleted",
  isAuthenticated,
  contactControllers.getSoftDeletedContacts
);

contactRouter.put(
  "/restore/:id",
  isAuthenticated,
  contactControllers.restoreContact
);

contactRouter.delete("/:id", isAuthenticated, contactControllers.deleteContact);
contactRouter.put(
  "/softdelete/:id",
  isAuthenticated,
  contactControllers.softDeleteContact
);
contactRouter.post("/reply/:id", isAuthenticated, contactControllers.replyToContact);
contactRouter.put("/:id", isAuthenticated, contactControllers.updateContact);

export default contactRouter;
