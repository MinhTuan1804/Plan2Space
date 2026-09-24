using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Plan2Space.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ProjectGeometryVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "GeometryVersion",
                table: "Projects",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GeometryVersion",
                table: "Projects");
        }
    }
}
