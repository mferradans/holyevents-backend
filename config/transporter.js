import nodemailer from 'nodemailer';

// Configura Nodemailer con los detalles de tu proveedor de correo
const transporter = nodemailer.createTransport({
  service: 'gmail', // Cambia el servicio si usas otro proveedor
  auth: {
    user: 'rohixvm@gmail.com', // Reemplaza con tu dirección de correo
    pass: 'rvey qzrw bjwm poss', // Reemplaza con la contraseña de tu correo
  },
});

export default transporter;
