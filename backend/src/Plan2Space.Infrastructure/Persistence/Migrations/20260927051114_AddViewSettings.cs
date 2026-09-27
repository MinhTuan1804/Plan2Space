using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Plan2Space.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddViewSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ViewSettings",
                table: "Projects",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ViewSettings",
                table: "Projects");
        }
    }
}
