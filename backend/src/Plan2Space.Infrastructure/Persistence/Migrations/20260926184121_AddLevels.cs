using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Plan2Space.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLevels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Level",
                table: "Walls",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Level",
                table: "Rooms",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Level",
                table: "Openings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Level",
                table: "Furniture",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Level",
                table: "Walls");

            migrationBuilder.DropColumn(
                name: "Level",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "Level",
                table: "Openings");

            migrationBuilder.DropColumn(
                name: "Level",
                table: "Furniture");
        }
    }
}
