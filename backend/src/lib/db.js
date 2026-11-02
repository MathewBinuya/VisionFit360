import mongoose from "mongoose";
import User from "../models/user.model.js";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`Database connected ${conn.connection.host}`);

    // Reconcile the User indexes with the current schema. This matters because
    // username is now a SPARSE unique index (accounts can exist before a username
    // is chosen in onboarding). Without this, the old non-sparse unique index on
    // username would treat every "no username yet" account as null and reject the
    // second such signup with a duplicate-key error. syncIndexes drops the stale
    // index and builds the sparse one. Non-fatal if it can't run.
    try {
      await User.syncIndexes();
    } catch (indexErr) {
      console.log("User.syncIndexes skipped:", indexErr.message);
    }
  } catch (error) {
    console.log("Error connect to database", error);
    process.exit(1); // exit w failure

  }
}