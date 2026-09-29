const { DataTypes } = require("sequelize");
const mongoose = require("mongoose");
const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();

// ============================================================================
// 1. Sequelize Model Definition & Associations (Sharpener Specification)
// ============================================================================
function initSequelizeModel(sequelize) {
  if (!sequelize) return null;

  const ForgotPasswordRequest = sequelize.define("ForgotPasswordRequest", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    }
  }, {
    tableName: "forgot_password_requests",
    timestamps: true
  });

  return ForgotPasswordRequest;
}

function associateSequelize(models) {
  if (!models) return;
  const { User, ForgotPasswordRequest } = models;
  if (User && ForgotPasswordRequest) {
    User.hasMany(ForgotPasswordRequest, { foreignKey: "userId", onDelete: "CASCADE" });
    ForgotPasswordRequest.belongsTo(User, { foreignKey: "userId" });
  }
}

// ============================================================================
// 2. Mongoose Schema Definition (For Active MongoDB Connection)
// ============================================================================
const forgotPasswordRequestSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4()
  },
  userId: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

forgotPasswordRequestSchema.index({ userId: 1 });

const MongooseModel = mongoose.models.ForgotPasswordRequest || 
  mongoose.model("ForgotPasswordRequest", forgotPasswordRequestSchema);

// ============================================================================
// 3. Unified Interface Wrapper (Works seamlessly in both Mongoose & Sequelize)
// ============================================================================
class ForgotPasswordRequestWrapper {
  static async create({ id, userId, isActive = true }) {
    const finalId = id || uuidv4();
    const doc = await MongooseModel.create({
      id: finalId,
      userId: String(userId),
      isActive: Boolean(isActive)
    });
    return this._wrap(doc);
  }

  static async findOne(query = {}) {
    let searchCriteria = {};
    if (query.where) {
      searchCriteria = query.where;
    } else {
      searchCriteria = query;
    }

    const doc = await MongooseModel.findOne(searchCriteria);
    if (!doc) return null;
    return this._wrap(doc);
  }

  static async findByPk(id) {
    return this.findOne({ id });
  }

  static async update(values, options = {}) {
    const searchCriteria = options.where || options;
    return await MongooseModel.updateMany(searchCriteria, { $set: values });
  }

  static _wrap(doc) {
    if (!doc) return null;
    return {
      id: doc.id,
      userId: doc.userId,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      _doc: doc,
      async save() {
        doc.isActive = this.isActive;
        await doc.save();
        return this;
      },
      async update(values) {
        if (values.isActive !== undefined) {
          this.isActive = values.isActive;
          doc.isActive = values.isActive;
        }
        await doc.save();
        return this;
      }
    };
  }
}

// Attach Sequelize helpers
ForgotPasswordRequestWrapper.initSequelize = initSequelizeModel;
ForgotPasswordRequestWrapper.associate = associateSequelize;
ForgotPasswordRequestWrapper.MongooseModel = MongooseModel;

module.exports = ForgotPasswordRequestWrapper;
