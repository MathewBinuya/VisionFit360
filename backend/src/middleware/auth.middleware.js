import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const auth = async (req, res, next) => {
  try {
    // get token
     const header = req.headers.authorization;
   
     if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token, authorization denied" });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET); 

    // fetch user and verify token matches stored one (single-session enforcement)
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({ message: "Token is not valid" });
    }

    req.user = { id: user._id };
    next();
  

} catch (error) {
    // Expired/invalid tokens are NORMAL (tokens expire, clients send stale ones) —
    // log a quiet one-liner, not a full stack trace. Only unexpected errors get the
    // loud console.error. Either way the client gets a clean 401 and logs out.
    const expected = ["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"];
    if (expected.includes(error?.name)) {
      console.log(`Auth: rejected token (${error.name})`);
    } else {
      console.error("Error in auth middleware:", error);
    }
    res.status(401).json({ message: "Token is not valid" });
  }
};

export default auth;