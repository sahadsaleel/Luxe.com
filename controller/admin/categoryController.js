const Category = require('../../models/categorySchema');



const categoryInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);

        res.render('admin/category', {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        });
    } catch (error) {
        console.error('Error in categoryInfo:', error);
        res.redirect('/admin/pageerror');
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, description, isListed } = req.body;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Category name is required' });
        }
        if (name.startsWith('$')) {
            return res.status(400).json({ error: 'Category name cannot start with "$"' });
        }

        const existingCategory = await Category.findOne({
            name: { $regex: `^${name}$`, $options: 'i' }
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Category already exists' });
        }

        const newCategory = new Category({ name, description, isListed });
        await newCategory.save();

        return res.json({ message: 'Category added successfully', category: newCategory });
    } catch (error) {
        console.error('Error in addCategory:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};


const editCategory = async (req, res) => {
    try {
        const { id, name, description, isListed } = req.body;

        if (!id || id === 'null' || id === '') {
            return res.status(400).json({ error: 'Invalid category ID' });
        }

        const existingCategory = await Category.findOne({ name, _id: { $ne: id } });
        if (existingCategory) {
            return res.status(400).json({ error: 'Category already exists' });
        }

        await Category.updateOne(
            { _id: id },
            { $set: { name, description, isListed } }
        );

        return res.json({ message: 'Category updated successfully' });
    } catch (error) {
        console.error('Error in editCategory:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.body;

        await Category.deleteOne({ _id: id });
        return res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error in deleteCategory:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    categoryInfo,
    addCategory,
    editCategory,
    deleteCategory
};