import mongoose from 'mongoose';
import Transaction from './models/Transaction.js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Conectar a MongoDB
const mongoURI = process.env.MONGODB_URI;

// Validar que tenemos la URI
if (!mongoURI) {
  console.error('❌ ERROR: No se encontró MONGODB_URI en las variables de entorno');
  console.error('💡 Asegúrate de que existe un archivo .env con MONGODB_URI configurado');
  process.exit(1);
}

console.log('🔗 Conectando a MongoDB...');

mongoose.connect(mongoURI, {})
  .then(() => {
    console.log('✅ Conexión exitosa a MongoDB');
    desverificarVentasManuales();
  })
  .catch((error) => {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  });

async function desverificarVentasManuales() {
  try {
    console.log('🔍 Buscando ventas manuales verificadas...');
    
    // Buscar todas las ventas manuales que están verificadas
    const ventasManualesVerificadas = await Transaction.find({
      metadataType: 'manual',
      verified: true
    });

    console.log(`📊 Encontradas ${ventasManualesVerificadas.length} ventas manuales verificadas`);

    if (ventasManualesVerificadas.length === 0) {
      console.log('🎉 No hay ventas manuales verificadas para actualizar');
      mongoose.connection.close();
      return;
    }

    // Mostrar detalles de las ventas que se van a actualizar
    console.log('\n📋 Ventas que serán desverificadas:');
    ventasManualesVerificadas.forEach((venta, index) => {
      console.log(`   ${index + 1}. ${venta.name} ${venta.lastName} - ${venta.email} - ${venta.transactionDate.toLocaleDateString()}`);
    });

    console.log('\n🔄 Actualizando ventas manuales...');

    // Actualizar todas las ventas manuales a verified: false
    const resultado = await Transaction.updateMany(
      { 
        metadataType: 'manual', 
        verified: true 
      },
      { 
        $set: { verified: false } 
      }
    );

    console.log(`✅ ¡Proceso completado exitosamente!`);
    console.log(`📊 ${resultado.modifiedCount} ventas manuales fueron desverificadas`);
    console.log(`💡 Ahora todas las ventas manuales aparecerán como "No verificadas" en la tabla`);
    console.log(`🎫 Se verificarán cuando escaneen el QR en el evento`);

  } catch (error) {
    console.error('❌ Error al desverificar ventas manuales:', error);
  } finally {
    // Cerrar la conexión
    mongoose.connection.close();
    console.log('🔒 Conexión a MongoDB cerrada');
  }
} 