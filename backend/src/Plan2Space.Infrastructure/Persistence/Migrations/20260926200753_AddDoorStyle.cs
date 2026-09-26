using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Plan2Space.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDoorStyle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DoorStyle",
                table: "Openings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DoorStyle",
                table: "Openings");
        }
    }
}
