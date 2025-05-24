import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  mercadoPagoAccessToken: { type: String, required: true },
  mercadoPagoPublicKey: { type: String, required: true },
  telefono: { type: String }
});

const Admin = mongoose.model('Admin', adminSchema);
export default Admin;
