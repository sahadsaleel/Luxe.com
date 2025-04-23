const mongoose = require('mongoose')
const env = require('dotenv').config()


const connectDB = async ()=>{
    try {
        await mongoose.connect(process.env.MONGODB_URI)
        console.log("DB  connected");
        
    } catch (error) {
        console.log("DB connection error " , error.message);
        process.exit(1)
    }
}

module.exports = connectDB



// const mongoose = require('mongoose');

// const connectDB = () => {
//     mongoose.connect('mongodb://localhost/luxe', {
//         useNewUrlParser: true,
//         useUnifiedTopology: true
//     }).then(() => console.log('MongoDB connected'))
//       .catch(err => console.error('MongoDB connection error:', err));
// };

// module.exports = connectDB;