const pageNotFound = async (req,res)=>{
    try {
        res.render("user/page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}



const loadHomepage = async (req,res)=>{
    try {
        return res.render("user/home")
    } catch (error) {
        console.log("Home page not found");
        res.status(500).send("Server error")
    }
}

module.exports = {
    loadHomepage,
    pageNotFound,
}