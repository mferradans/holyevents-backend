import bcrypt from 'bcryptjs';
import Admin from './models/Admin.js'; // Asegúrate de que la ruta sea correcta a tu modelo de Admin
import mongoose from 'mongoose';
import readline from 'readline';

// Conectar a la base de datos de MongoDB
mongoose.connect('mongodb+srv://ferra:isa-5410@cluster0.b67ob.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const createAdmin = async (email, password, mercadoPagoAccessToken, mercadoPagoPublicKey) => {
  try {
    // Verificar si el administrador ya existe
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      console.log('El administrador con este email ya existe.');
      return;
    }

    // Encriptar la contraseña antes de guardarla
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear el nuevo administrador
    const newAdmin = new Admin({
      email,
      password: hashedPassword,
      mercadoPagoAccessToken, // Añadir el accessToken de MercadoPago
      mercadoPagoPublicKey    // Añadir el publicKey de MercadoPago
    });

    // Guardar el administrador en la base de datos
    await newAdmin.save();
    console.log(`Administrador creado exitosamente con el email: ${email}`);
  } catch (error) {
    console.error('Error al crear el administrador:', error.message);
  } finally {
    // Cerrar la conexión a la base de datos
    mongoose.connection.close();
  }
};

// Preguntar por los datos del administrador
rl.question('Email: ', (email) => {
  rl.question('Password: ', (password) => {
    rl.question('MercadoPago AccessToken: ', (mercadoPagoAccessToken) => {
      rl.question('MercadoPago PublicKey: ', (mercadoPagoPublicKey) => {
        // Llamar a la función para crear el administrador
        createAdmin(email, password, mercadoPagoAccessToken, mercadoPagoPublicKey);
        rl.close();
      });
    });
  });
});
