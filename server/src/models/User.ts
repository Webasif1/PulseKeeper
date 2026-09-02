import bcrypt from 'bcryptjs';
import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

/** Work factor for bcrypt. 12 is ~250ms per hash on current hardware. */
const BCRYPT_ROUNDS = 12;

export interface IUser {
  name: string;
  email: string;
  /** bcrypt hash. `select: false`, so it is absent unless explicitly requested. */
  password: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
export type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name must be at most 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'Email is too long'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      // Excluded from every query by default so a hash cannot reach a response
      // through a forgotten projection.
      select: false,
    },
    avatar: {
      type: String,
      trim: true,
      maxlength: 2048,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

/**
 * Hash on save.
 *
 * Deliberately a model hook rather than service code: hashing must be
 * impossible to forget. Any future code path that writes a password — a reset
 * flow, an admin tool, a seed script — is covered by construction.
 */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = function comparePassword(
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User = model<IUser, UserModel>('User', userSchema);

export type UserId = Types.ObjectId;
