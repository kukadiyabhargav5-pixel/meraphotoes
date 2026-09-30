const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/maraphoto');
  console.log('Connected to DB');
  
  const admin = await mongoose.connection.collection('users').findOne({ 
    $or: [{ email: 'maraphoto303@gmail.com' }, { role: 'SUPER_ADMIN' }] 
  });
  
  if (!admin) {
    console.log('No super admin found in users collection');
    process.exit(0);
  }
  
  console.log('Found Admin:', admin._id, admin.email);
  
  let studio = await mongoose.connection.collection('studios').findOne({ ownerId: admin._id });
  if (!studio) {
    console.log('Creating new studio for Admin');
    const newStudio = await mongoose.connection.collection('studios').insertOne({
      name: 'Super Admin Studio',
      ownerId: admin._id,
      subscriptionPlan: 'PREMIUM',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date('2099-12-31'),
      usage: { photosUploaded: 0, videosUploaded: 0, eventsCreated: 0 },
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Created studio:', newStudio.insertedId);
  } else {
    console.log('Updating existing studio for Admin:', studio._id);
    const updateRes = await mongoose.connection.collection('studios').updateOne(
      { _id: studio._id },
      {
        $set: {
          name: 'Super Admin Studio',
          subscriptionPlan: 'PREMIUM',
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: new Date('2099-12-31')
        }
      }
    );
    console.log('Updated studio successfully:', updateRes.modifiedCount);
  }
  
  const verified = await mongoose.connection.collection('studios').findOne({ ownerId: admin._id });
  console.log('Verified Studio:', {
    name: verified.name,
    subscriptionPlan: verified.subscriptionPlan,
    subscriptionStatus: verified.subscriptionStatus,
    expires: verified.subscriptionExpiresAt
  });

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
