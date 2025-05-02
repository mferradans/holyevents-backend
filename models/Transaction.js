import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  price: Number,
  quantity: Number,
  name: String,
  lastName: String,
  email: String,
  tel: { type: String, required: true },
  selectedMenus: { type: Map, of: String },
  transactionDate: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
  metadataType: {
    type: String,
    enum: ['manual', 'mercadopago'],
    default: 'mercadopago'
  }
});


const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;