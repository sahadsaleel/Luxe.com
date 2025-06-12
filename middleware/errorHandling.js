
const errorHandler = (err, req, res, next) => {
    console.error('Global error handler triggered:', {
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body
    });

    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ error: 'Something went wrong!' });
    }
    res.status(500).send('Something went wrong!');
};

module.exports = errorHandler;