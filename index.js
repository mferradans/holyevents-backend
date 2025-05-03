import express from "express" ;
import cors from "cors";
import dotenv from "dotenv"; // Importamos dotenv para las variables de entorno
dotenv.config();

// SDK de Mercado Pago
import { MercadoPagoConfig, Preference } from "mercadopago" ;
import Transaction from './models/Transaction.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import transporter from './config/transporter.js'; // Ajusta la ruta según tu estructura de carpetas
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import {verifyToken} from './routes/authRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Event from './models/Event.js';
import axios from 'axios';
import fetch from 'node-fetch'; // Asegúrate de importar esto al inicio del archivo


const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, {
})
.then(() => console.log('Conexión exitosa a MongoDB'))
.catch((error) => console.error('Error conectando a MongoDB:', error));


const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



app.use(cors({
  origin: process.env.CLIENT_URL || "http://127.0.0.1:5173", 
  credentials: true
}));
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);

app.get("/", (req, res) => {
    res.send("Soy el server:)");
});

app.get('/api/transactions/stats', verifyToken, async (req, res) => {
  try {
    const stats = await Transaction.aggregate([
      {
        $lookup: {
          from: 'events', // Colección de eventos
          localField: 'eventId', // Campo en Transaction (eventId)
          foreignField: '_id', // Campo en Event (_id)
          as: 'eventDetails' // Alias para los detalles del evento
        }
      },
      {
        $unwind: '$eventDetails' // Descomponer el array de eventDetails
      },
      {
        $match: { 'eventDetails.createdBy': new mongoose.Types.ObjectId(req.adminId) } // Filtrar por adminId del evento
      },
      {
        $group: {
          _id: "$eventDetails.name", // Agrupar por el nombre del evento
          transactionCount: { $sum: 1 }, // Contar cuántas transacciones hay por evento
          totalIncome: { $sum: "$price" }, // Sumar el precio para obtener el ingreso total
        }
      }
    ]);

    res.json(stats); // Enviar las estadísticas al frontend
  } catch (error) {
    console.error('Error al obtener las estadísticas de las transacciones:', error);
    res.status(500).send('Error al obtener las estadísticas de las transacciones.');
  }
});

app.get('/api/events/:id/transaction-count', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Contar las transacciones realizadas para el evento
    const transactionCount = await Transaction.countDocuments({ eventId: id });

    res.json({ transactionCount });
  } catch (error) {
    console.error('Error al contar las transacciones del evento:', error);
    res.status(500).send('Error al contar las transacciones.');
  }
});


app.post('/create_preference', async (req, res) => {
    const { eventId, price, name, lastName, email, selectedMenus, tel } = req.body;

    try {
      const event = await Event.findById(eventId).populate('createdBy');
      if (!event) {
        return res.status(404).json({ error: 'Evento no encontrado' });
      }

      const accessToken = event.createdBy.mercadoPagoAccessToken || process.env.MERCADOPAGO_ACCESS_TOKEN;
      const client = new MercadoPagoConfig({ accessToken });

      const fixedSelectedMenus = {};
      Object.entries(selectedMenus || {}).forEach(([dateStr, menu]) => {
        if (menu) {
          fixedSelectedMenus[dateStr] = menu;
        }
      });
      
      console.log("🟡 selectedMenus recibido en /create_preference:", selectedMenus);
  console.log("🟡 fixedSelectedMenus procesado:", fixedSelectedMenus);


  const metadata = {
    eventId,
    price,
    name,
    lastName,
    email,
    tel,
    selectedMenus: fixedSelectedMenus,
    accessToken
  };


      const body = {
        items: [{
          title: event.name,
          quantity: 1,
          unit_price: Number(price),
          currency_id: 'ARS'
        }],
        payer: { name, surname: lastName, email, tel },
        metadata,
        auto_return: 'approved',
        back_urls: {
          success: `${process.env.CLIENT_URL}/payment_success`,
          failure: `${process.env.CLIENT_URL}/payment_failure`,
          pending: `${process.env.CLIENT_URL}/payment_pending`
        },
        notification_url: `${process.env.SERVER_URL}/webhook?source_news=webhooks`
      };

      const preference = new Preference(client);
      const result = await preference.create({ body });

      res.json({ id: result.id });
    } catch (error) {
      console.error('Error en /create_preference:', error);
      res.status(500).json({ error: 'Error al crear la preferencia' });
    }
});



app.get('/payment_success', async (req, res) => {
  const { payment_id } = req.query;

  if (!payment_id) {
    return res.redirect(`${process.env.CLIENT_URL}/payment_success?status=missing_payment_id`);
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
      }
    });

    const payment = await response.json();
    const metadata = payment.metadata;

    if (!metadata || !metadata.email || !metadata.event_id || !metadata.price) {
      return res.redirect(`${process.env.CLIENT_URL}/payment_success?status=metadata_error`);
    }

    const transaction = await Transaction.findOne({
      eventId: metadata.event_id,
      email: metadata.email,
      price: metadata.price
    });

    if (!transaction) {
      return res.redirect(`${process.env.CLIENT_URL}/payment_success?status=not_found`);
    }

    return res.redirect(`${process.env.CLIENT_URL}/success?transactionId=${transaction._id}`);
  } catch (error) {
    console.error('❌ Error en /payment_success:', error);
    return res.redirect(`${process.env.CLIENT_URL}/payment_success?status=error`);
  }
});





app.get("/download_receipt/:transactionId", async (req, res) => {
  const { transactionId } = req.params;
  console.log(`📥 [DOWNLOAD] Solicitud para descargar comprobante de transacción: ${transactionId}`);

  try {
    const transaction = await Transaction.findById(transactionId).lean();
    if (!transaction) {
      console.warn("⚠️ Transacción no encontrada en la base de datos.");
      return res.status(404).send("Transacción no encontrada.");
    }
    console.log("✅ Transacción encontrada:", transaction.email, transaction._id);

    const event = await Event.findById(transaction.eventId).lean();
    if (!event) {
      console.warn("⚠️ Evento asociado no encontrado.");
      return res.status(404).send("Evento asociado no encontrado.");
    }
    console.log("✅ Evento encontrado:", event.name, event._id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="comprobante_${transactionId}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res); // 🔁 Pipe se mueve arriba del contenido

    const verificationUrl = `${process.env.CLIENT_URL}/verification_result?transactionId=${transaction._id}`;
    const qrCodeImage = await QRCode.toDataURL(verificationUrl);
    console.log("✅ Código QR generado con URL:", verificationUrl);

    const containerX = 100;
    const containerWidth = 400;
    const leftMargin = 120;
    let yPosition = 50;

    doc.rect(containerX, yPosition, containerWidth, 700).stroke();

    // Imagen de portada del evento
    if (event.coverImage) {
      try {
        const response = await axios({
          method: 'get',
          url: event.coverImage,
          responseType: 'arraybuffer'
        });
        const imageBuffer = Buffer.from(response.data, 'binary');
        doc.image(imageBuffer, containerX + 10, yPosition + 10, { width: 380, height: 120 });
        console.log("🖼️ Imagen de portada cargada correctamente.");
      } catch (imageErr) {
        console.warn("⚠️ No se pudo cargar la imagen del evento:", imageErr.message);
      }
    }

    yPosition += 140;

    // Código QR
    doc.image(qrCodeImage, containerX + (containerWidth - 150) / 2, yPosition, { width: 150, height: 150 })
      .rect(containerX + (containerWidth - 150) / 2, yPosition, 150, 150)
      .stroke("#8B0000");

    yPosition += 160;

    // Datos del evento y comprador
    doc.fontSize(20).font("Helvetica-Bold").text(event.name.toUpperCase(), containerX, yPosition, { align: "center", width: containerWidth });
    yPosition += 30;

    doc.fontSize(14).font("Helvetica").text(`Fecha del evento: ${new Date(event.startDate).toLocaleDateString("es-AR")}`, containerX, yPosition, { align: "center", width: containerWidth });
    yPosition += 30;

    doc.fontSize(12).font("Helvetica-Bold").text("Nº de ticket:", leftMargin, yPosition, { continued: true }).font("Helvetica").text(` ${transaction._id}`);
    yPosition += 20;

    doc.font("Helvetica-Bold").text("Nombre:", leftMargin, yPosition, { continued: true }).font("Helvetica").text(` ${transaction.name} ${transaction.lastName}`);
    yPosition += 20;

    doc.font("Helvetica-Bold").text("Email:", leftMargin, yPosition, { continued: true }).font("Helvetica").text(` ${transaction.email}`);
    yPosition += 20;

    // Menús seleccionados
    if (transaction.selectedMenus && Object.keys(transaction.selectedMenus).length > 0) {
      doc.font("Helvetica-Bold").text("Menús seleccionados:", leftMargin, yPosition);
      yPosition += 20;

      Object.entries(transaction.selectedMenus).forEach(([moment, menu]) => {
        const parsedDate = new Date(moment.replace(/_t|_z/gi, 'T')); // limpieza por si vienen mal formateadas
        const formattedDate = isNaN(parsedDate) ? moment : parsedDate.toLocaleString("es-AR");
        doc.font("Helvetica").text(`• ${formattedDate}: ${menu}`, leftMargin + 20, yPosition);
        yPosition += 20;
      });
    } else {
      console.log("ℹ️ No hay menús seleccionados para mostrar.");
    }

    yPosition += 20;
    doc.font("Helvetica-Bold").text("Fecha de compra:", leftMargin, yPosition, { continued: true }).font("Helvetica").text(` ${new Date(transaction.transactionDate).toLocaleDateString("es-AR")}`);
    yPosition += 20;

    doc.font("Helvetica-Bold").text("Precio total:", leftMargin, yPosition, { continued: true }).font("Helvetica").text(` $${transaction.price}`);
    yPosition += 40;

    // Franja inferior de aviso
    doc.rect(containerX, yPosition, containerWidth, 50).fillAndStroke("#e0e0e0", "#000")
      .fontSize(10).fillColor("black")
      .text("IMPORTANTE: NO escanee el código QR. Este ticket debe ser presentado en la entrada del evento en su celular o impreso.", containerX + 10, yPosition + 10, { width: containerWidth - 20, align: "center" });

    yPosition += 60;

    // Logos
    const logoHolyPath = path.join(__dirname, "images", "holyevents.png");
    const logoMiporaPath = path.join(__dirname, "images", "mipora.png");
    const logoSize = 60;

    if (fs.existsSync(logoHolyPath)) {
      doc.image(logoHolyPath, containerX + 90, yPosition, { width: logoSize, height: logoSize });
      console.log("✅ Logo HolyEvents cargado.");
    } else {
      console.warn("⚠️ Logo HolyEvents no encontrado.");
    }

    if (fs.existsSync(logoMiporaPath)) {
      doc.image(logoMiporaPath, containerX + 230, yPosition, { width: logoSize, height: logoSize });
      console.log("✅ Logo Mipora cargado.");
    } else {
      console.warn("⚠️ Logo Mipora no encontrado.");
    }

    doc.end(); // Finaliza y envía el PDF
    console.log("🎉 PDF generado y enviado correctamente.");
  } catch (error) {
    console.error("❌ Error al generar el comprobante:", error);
    res.status(500).send("Error al generar el comprobante.");
  }
});





// Ruta para verificar la transacción por ID
app.get("/verify_transaction/:transactionId", async (req, res) => {
  const { transactionId } = req.params;

  try {
    // Buscar la transacción en la base de datos
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.json({ success: false, message: 'Transacción no encontrada.' });
    }

    // Si la transacción se encuentra, enviar los detalles al frontend
    res.json({
      success: true,
      name: transaction.name,
      transactionId: transaction._id,
      lastName: transaction.lastName,
      eventId: transaction.eventId,
      price: transaction.price,
      menu: transaction.menu,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al verificar la transacción.' });
  }
});


app.post("/webhook", express.json(), async (req, res) => {
  const topic = req.body.type;
  const paymentId = req.body.data?.id;

  if (topic !== 'payment') {
    return res.sendStatus(200);
  }

  if (!paymentId) {
    console.warn("⚠️ Falta paymentId en la notificación.");
    return res.sendStatus(400);
  }

  console.log(`⏳ Esperando 6 segundos para consultar paymentId: ${paymentId}`);

  setTimeout(async () => {
    try {
      // 1. Consulta inicial para intentar obtener el token dinámico desde metadata
      console.log("🔄 Primera consulta a MP con token de entorno...");
      const tempResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
        }
      });
      const tempPayment = await tempResponse.json();

      const dynamicToken = tempPayment?.metadata?.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN;

      // 2. Consulta final con token correcto
      console.log(`🔄 Segunda consulta a MP con token dinámico (${dynamicToken === process.env.MERCADOPAGO_ACCESS_TOKEN ? "token de entorno" : "token del vendedor"})...`);
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${dynamicToken}`
        }
      });

      const payment = await response.json();

      console.log(`🔍 Respuesta final para paymentId ${paymentId}:`);
      console.log(JSON.stringify(payment, null, 2));

      if (response.status === 404 || payment.message === 'Payment not found') {
        console.error("❌ No se encontró el pago o aún no está disponible en la API de Mercado Pago.");
        return;
      }

      if (payment.status !== 'approved') {
        console.log(`ℹ️ Pago ${paymentId} NO aprobado (estado: ${payment.status}).`);
        return;
      }

      const metadata = payment.metadata;

      if (!metadata || !metadata.event_id || !metadata.email) {
        console.warn("⚠️ Metadata incompleto en el pago recibido.");
        return;
      }      

      const exists = await Transaction.findOne({
        eventId: metadata.eventId,
        email: metadata.email,
        price: metadata.price
      });

      if (exists) {
        console.log("🛑 Transacción ya existente. No se guarda duplicado.");
        return;
      }
      const selectedMenus = metadata.selectedMenus || metadata.selected_menus;
      if (!selectedMenus || Object.keys(selectedMenus).length === 0) {
        console.warn("⚠️ selectedMenus vacío o no definido.");
      } else {
        console.log("🟢 selectedMenus recibido en webhook:", selectedMenus);
      }
      
      
      const newTransaction = new Transaction({
        eventId: metadata.event_id,
        price: metadata.price,
        name: metadata.name,
        lastName: metadata.last_name,
        email: metadata.email,
        tel: metadata.tel,
        selectedMenus: selectedMenus, 
        transactionDate: new Date(),
        verified: false
      });      
      console.log("📦 Metadata recibida en webhook:", metadata);

      await newTransaction.save();
      console.log(`✅ Transacción guardada correctamente para ${metadata.email}`);
    } catch (error) {
      console.error("❌ Error procesando webhook:", error);
    }
  }, 6000); // ⏱️ Aumentamos la espera a 6 segundos

  res.sendStatus(200);
});

app.get('/get_transaction', async (req, res) => {
  const { paymentId } = req.query;

  if (!paymentId) {
    return res.status(400).json({ error: 'Falta paymentId' });
  }

  try {
    // Buscar el pago real en Mercado Pago
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
      }
    });
    const payment = await response.json();

    const metadata = payment.metadata;

    if (!metadata || !metadata.email || !metadata.event_id || !metadata.price) {
      console.warn('⚠️ Metadata incompleta o mal formada.');
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    const transaction = await Transaction.findOne({
      eventId: metadata.event_id,
      email: metadata.email,
      price: metadata.price
    });

    if (!transaction) {
      console.warn('⚠️ Transacción no encontrada en la DB.');
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('❌ Error en /get_transaction:', error);
    res.status(500).json({ error: 'Error al obtener la transacción' });
  }
});


  
app.get("/payment_failure", (req, res) => {
    res.send("El pago ha fallado. Inténtalo nuevamente.");
});

app.get("/payment_pending", (req, res) => {
    res.send("El pago está pendiente. Espera la confirmación.");
});

app.listen(port, ()=>{
    console.log(`El servidor esta corriendo en el puerto ${port}`);
})        

