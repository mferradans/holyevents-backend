import express from 'express';
import Event from '../models/Event.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { verifyToken } from './authRoutes.js'; // Importar middleware de verificación
import jwt from 'jsonwebtoken'; // Importa jsonwebtoken
const JWT_SECRET = 'tu_clave_secreta_aqui'; // Usa tu clave secreta
import Transaction from '../models/Transaction.js';

const router = express.Router();
// Configurar Multer para almacenamiento y límite de tamaño
// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/');  // Carpeta donde se guardarán las imágenes
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname));  // Nombre único para cada archivo
    },
  });
  
  // Configurar límite de tamaño y tipos de archivo permitidos
  const upload = multer({
    storage: storage,
    limits: { fileSize: 3 * 1024 * 1024 },  // Límite de 1 MB
    fileFilter: (req, file, cb) => {
      const filetypes = /jpeg|jpg|png/;
      const mimetype = filetypes.test(file.mimetype);
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Solo se permiten imágenes en formato jpeg, jpg o png'));
      }
    },
  });
  
  // Ruta para cargar la imagen
  router.post('/upload', (req, res) => {
    upload.single('coverImage')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'La imagen es demasiado grande. El límite es de 1 MB.' });
        }
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
  
      if (!req.file) {
        return res.status(400).json({ error: 'No se subió ninguna imagen' });
      }
      
      res.json({ imageUrl: `/uploads/${req.file.filename}` });
    });
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
    const { name, location, description, price, startDate, endPurchaseDate, capacity, hasMenu, menuOptions, coverImage, status, imageRemoved } = req.body;
  
    // Obtener el directorio actual al estilo ES6
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
  
    try {
      // Encontrar el evento antes de actualizarlo
      const event = await Event.findById(id);
  
      if (!event) {
        return res.status(404).json({ error: 'Evento no encontrado' });
      }
  
      // Si la imagen ha sido removida o si se ha subido una nueva imagen
      if (imageRemoved || (coverImage && coverImage !== event.coverImage)) {
        const oldImagePath = path.join(__dirname, '../uploads', path.basename(event.coverImage));  // Asegurarse de obtener solo el nombre del archivo
  
        // Verificar si la imagen existe y si es un archivo, no una carpeta
        if (fs.existsSync(oldImagePath) && fs.lstatSync(oldImagePath).isFile()) {
          fs.unlink(oldImagePath, (err) => {
            if (err) {
              console.error('Error al eliminar la imagen de portada anterior:', err);
            }
          });
        } else {
          console.error('La imagen no es un archivo o no existe.');
        }
      }
  
      // Actualizar el evento con los nuevos datos, y eliminar la imagen si fue removida
      const updatedEvent = await Event.findByIdAndUpdate(id, {
        name,
        location,
        description,
        price,
        startDate,
        endPurchaseDate,
        capacity,
        hasMenu,
        menuOptions: hasMenu ? menuOptions : [],
        coverImage: imageRemoved ? '' : coverImage,  // Si se quitó la imagen, guardamos una cadena vacía
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
  
export default router;
