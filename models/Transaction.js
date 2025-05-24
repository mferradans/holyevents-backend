import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  paymentId: {
    type: String,
    required: function () {
      return this.metadataType !== 'manual';
    },
    unique: true
  },
  price: Number,
  quantity: Number,
  name: String,
  lastName: String,
  email: String,
  tel: { type: String, required: true },
  selectedMenus: { type: Object },
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
