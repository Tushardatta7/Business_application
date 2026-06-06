import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cashRouter from "./cash";
import partiesRouter from "./parties";
import ledgerRouter from "./ledger";
import batchesRouter from "./batches";
import stockRouter from "./stock";
import dashboardRouter from "./dashboard";
import balanceSheetRouter from "./balance-sheet";
import settingsRouter from "./settings";
import pnlRouter from "./pnl";
import imageUploadRouter from "./imageUpload";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/cash", cashRouter);
router.use("/parties", partiesRouter);
router.use("/ledger", ledgerRouter);
router.use("/batches", batchesRouter);
router.use("/stock", stockRouter);
router.use("/dashboard", dashboardRouter);
router.use("/balance-sheet", balanceSheetRouter);
router.use("/settings", settingsRouter);
router.use("/pnl", pnlRouter);
router.use("/image-upload", imageUploadRouter);

export default router;
