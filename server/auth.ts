import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const user = storage.getUserByEmail(email);
      if (!user) return done(null, false, { message: "Invalid email or password" });
      const match = await bcrypt.compare(password, user.password);
      if (!match) return done(null, false, { message: "Invalid email or password" });
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser((id: number, done) => {
  const user = storage.getUser(id);
  done(null, user || null);
});

export { passport };
