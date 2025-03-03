// models/Event.js
import mongoose from 'mongoose';

const menuMomentSchema = new mongoose.Schema({
  dateTime: { type: Date, required: true },
  menuOptions: [{ type: String, required: true }],
});

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endPurchaseDate: { type: Date, required: true },
  capacity: { type: Number, required: true },
  menuMoments: [menuMomentSchema], // Agregado para manejar momentos de menú
  hasMenu: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },
  coverImage: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

const Event = mongoose.model('Event', eventSchema);
export default Event;