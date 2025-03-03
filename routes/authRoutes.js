import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

const router = express.Router();
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET; // Ahora usa la variable de entorno

// Middleware para verificar token y extraer el adminId
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Asegurar que haya un token
  if (!token) {
    return res.status(401).json({ error: 'Token faltante o inválido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminId = decoded.id; // Guardar el adminId en la solicitud
    next(); // Continuar a la siguiente función
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

export { verifyToken };

// Ruta para registro de administradores (solo para pruebas)
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ email, password: hashedPassword });
    await admin.save();
    res.status(201).json({ message: 'Admin registrado con éxito' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar administrador' });
  }
});

// Ruta para login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ error: 'Credenciales incorrectas' });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Ruta para acceder al dashboard (ruta protegida)
router.get('/dashboard', (req, res) => {
  const token = req.headers.authorization.split(' ')[1]; // Extraer el token
  if (!token) {
    return res.status(401).json({ error: 'Token faltante' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    res.json({ message: `Bienvenido al dashboard del administrador con ID: ${verified.id}` });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
});
// Ruta para obtener el public key de MercadoPago de un administrador
router.get('/:adminId/public_key', async (req, res) => {
  const { adminId } = req.params;

  try {
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Administrador no encontrado' });
    }

    res.json({ publicKey: admin.mercadoPagoPublicKey });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener las credenciales del administrador' });
  }
});
export default router;
