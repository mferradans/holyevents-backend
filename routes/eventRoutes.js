import express from 'express';
import Event from '../models/Event.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { verifyToken } from './authRoutes.js'; // Importar middleware de verificación
import jwt from 'jsonwebtoken'; // Importa jsonwebtoken
import dotenv from 'dotenv';
import axios from 'axios';
import FormData from 'form-data';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET; // Ahora usa la variable de entorno
import Transaction from '../models/Transaction.js';

const router = express.Router();
// Configura Multer para manejar la memoria de almacenamiento
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/upload', upload.single('coverImage'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ninguna imagen' });
  }

  // Crear un objeto FormData para enviar a través de axios
  const formData = new FormData();
  formData.append('image', req.file.buffer.toString('base64'));
  formData.append('key', process.env.IMGBB_API_KEY);  // Asegúrate de tener esta clave en tus variables de entorno
  // formData.append('expiration', 600); // Opcional: establecer un tiempo de expiración para la imagen

  try {
    const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    // La respuesta incluye la URL de la imagen alojada en ImgBB
    const imageUrl = response.data.data.url;

    // Puedes guardar esta URL en tu base de datos si necesitas referencia
    res.json({ imageUrl: imageUrl });
  } catch (error) {
    console.error('Error al subir imagen a ImgBB:', error);
    res.status(500).json({ error: 'Error al subir imagen a ImgBB' });
  }
});


// Aplicar el middleware verifyToken a la ruta de creación de eventos
router.post('/create', verifyToken, async (req, res) => {
  const { name, location, description, price, startDate, endPurchaseDate, capacity, hasMenu, menuMoments, coverImage } = req.body;

  try {
    const adminId = req.adminId;
    const event = new Event({
      name,
      location,
      description,
      price,
      startDate,
      endPurchaseDate,
      capacity,
      hasMenu,
      menuMoments: hasMenu ? menuMoments : [],
      coverImage,
      createdBy: adminId,
    });

    await event.save();
    res.status(201).json({ message: 'Evento creado exitosamente', event });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el evento' });
  }
});


// Obtener los eventos creados por el admin logueado
router.get('/admin', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1]; // Obtener el token JWT

  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // Verificar el token
    const verified = jwt.verify(token, JWT_SECRET);
    const adminId = verified.id; // Obtener el ID del admin logueado

    // Obtener solo los eventos creados por este admin
    const events = await Event.find({ createdBy: adminId });

    res.json(events); // Enviar los eventos filtrados al frontend
  } catch (error) {
    console.error('Error al obtener los eventos:', error);
    res.status(500).json({ error: 'Error al obtener los eventos' });
  }
});


router.get('/', async (req, res) => {
  try {
    const events = await Event.find();
    const currentDate = new Date();

    // Verificar el estado de los eventos según la fecha actual
    const updatedEvents = await Promise.all(
      events.map(async (event) => {
        if (new Date(event.endPurchaseDate) < currentDate && event.status !== 'blocked') {
          // Actualizar el estado a 'blocked' si la fecha ya pasó
          event.status = 'blocked';
          await event.save();
        } else if (new Date(event.endPurchaseDate) >= currentDate && event.status === 'blocked') {
          // Cambiar el estado a 'active' si la fecha es posterior y estaba bloqueado
          event.status = 'active';
          await event.save();
        }
        return event;
      })
    );

    res.json(updatedEvents);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los eventos' });
  }
});

// Obtener un evento por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ message: 'Evento no encontrado' });
    }
    res.json(event);
  } catch (error) {
    console.error('Error al obtener el evento:', error);
    res.status(500).json({ message: 'Error al obtener el evento' });
  }
});


// Actualizar un evento y eliminar la imagen anterior si se sube una nueva
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name, location, description, price, startDate, endPurchaseDate,
    capacity, hasMenu, menuMoments, coverImage, status, imageRemoved
  } = req.body;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    if (imageRemoved || (coverImage && coverImage !== event.coverImage)) {
      const oldImagePath = path.join(__dirname, '../uploads', path.basename(event.coverImage));
      if (fs.existsSync(oldImagePath) && fs.lstatSync(oldImagePath).isFile()) {
        fs.unlink(oldImagePath, (err) => {
          if (err) console.error('Error al eliminar imagen anterior:', err);
        });
      }
    }

    const updatedEvent = await Event.findByIdAndUpdate(id, {
      name,
      location,
      description,
      price,
      startDate,
      endPurchaseDate,
      capacity,
      hasMenu,
      menuMoments: hasMenu ? menuMoments : [],
      coverImage: imageRemoved ? '' : coverImage,
      status,
    }, { new: true });

    res.json({ message: 'Evento actualizado exitosamente', event: updatedEvent });
  } catch (error) {
    console.error('Error al actualizar el evento:', error);
    res.status(500).json({ error: 'Error al actualizar el evento' });
  }
});





  // Eliminar un evento y su imagen de portada si existe

  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
  
    // Obtener el directorio actual al estilo ES6 (porque __dirname no existe en ES6)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
  
    try {
      // Encontrar el evento antes de eliminarlo
      const event = await Event.findById(id);
  
      if (!event) {
        return res.status(404).json({ error: 'Evento no encontrado' });
      }
  
      // Verificar si el evento tiene una imagen de portada y eliminarla
      if (event.coverImage) {
        const imagePath = path.join(__dirname, '../uploads', path.basename(event.coverImage));
        
        // Intentar eliminar la imagen, si existe
        fs.unlink(imagePath, (err) => {
          if (err) {
            console.error('Error al eliminar la imagen de portada:', err);
          }
        });
      }
  
      // Eliminar el evento de la base de datos
      await Event.findByIdAndDelete(id);
      res.json({ message: 'Evento eliminado exitosamente' });
    } catch (error) {
      console.error('Error al eliminar el evento:', error);
      res.status(500).json({ error: 'Error al eliminar el evento' });
    }
  });

// Ruta para bloquear el evento cuando alcanza su capacidad máxima
router.put('/:eventId/block', async (req, res) => {
  try {
    const eventId = req.params.eventId;
    await Event.findByIdAndUpdate(eventId, { status: 'blocked' });
    res.status(200).json({ message: 'Evento bloqueado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al bloquear el evento' });
  }
});

// Ruta para obtener ventas de un evento específico
router.get('/:eventId/sales', verifyToken, async (req, res) => {
  try {
    const { eventId } = req.params;

    // Obtener el evento
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    // Obtener transacciones del evento
    const sales = await Transaction.find({ eventId }).lean();

    res.json({
      eventName: event.name,
      sales
    });
  } catch (error) {
    console.error('Error al obtener las ventas:', error);
    res.status(500).json({ error: 'Error al obtener las ventas del evento' });
  }
});
router.post('/:eventId/manual-sale', verifyToken, async (req, res) => {
  try {
    const { name, lastName, email, tel, selectedMenus, metadataType = 'manual' } = req.body;
    const { eventId } = req.params;

    if (!name || !lastName || !email || !tel) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const transaction = new Transaction({
      eventId,
      name,
      lastName,
      email,
      tel,
      selectedMenus,
      metadataType,
      paymentId: `manual_${Date.now()}`,
      verified: true,
    });
    
    await transaction.save();
    res.status(201).json({ message: 'Venta manual registrada correctamente' });
  } catch (error) {
    console.error('❌ Error al guardar venta manual:', error);
    res.status(500).json({ error: error.message || 'Error al registrar la venta manual' });
  }
});


export default router;
