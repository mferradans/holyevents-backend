import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  mercadoPagoAccessToken: { type: String, required: true }, // Access Token de MercadoPago
  mercadoPagoPublicKey: { type: String, required: true },  // Public Key de MercadoPago
});

const Admin = mongoose.model('Admin', adminSchema);
export default Admin;
